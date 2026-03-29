#!/usr/bin/env node
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { healthCheck, shutdown, getPoolStats } from "./db.js";
import { createServer } from "./server.js";
import { extractBearerToken, resolveApiKey, resolveOAuthToken, apiKeyToTenant } from "./auth.js";
import type { ApiKeyRecord } from "./auth.js";
import { log, withRequestId } from "./logger.js";
import { ALL_MODULE_SCOPES } from "./auth.js";
import type { Tenant } from "./utils/validation.js";
import {
  serializeMetrics,
  registerDbPoolGauge,
  registerSessionsGauge,
  rateLimitHitsTotal,
  authFailuresTotal,
} from "./metrics.js";

const VERSION = "2.0.0";
const startedAt = Date.now();

// ── CORS origin allowlist ────────────────────────────────────────
const ALLOWED_ORIGINS = new Set(
  (process.env.MCP_ALLOWED_ORIGINS || "https://app.cynco.io,https://stegona.cynco.io,https://claude.ai").split(",").map((s) => s.trim()).filter(Boolean),
);

// ── Metrics auth token (optional — if set, /metrics requires Bearer token) ──
const METRICS_AUTH_TOKEN = process.env.METRICS_AUTH_TOKEN || "";

// ── Static assets (loaded once at startup) ───────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
let iconBuffer: Buffer | null = null;
let iconLightBuffer: Buffer | null = null;
try {
  iconBuffer = readFileSync(join(__dirname, "..", "assets", "icon.png"));
} catch { /* not fatal */ }
try {
  iconLightBuffer = readFileSync(join(__dirname, "..", "assets", "icon-light.png"));
} catch { /* not fatal */ }

// ── MCP service discovery (built once at startup) ────────────────
const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || "https://mcp-stegona.cynco.io";
const APP_URL = process.env.APP_URL || "https://app.cynco.io";
const mcpDescriptorJson = JSON.stringify({
  name: "cynco-accounting",
  version: VERSION,
  description: "AI-native accounting platform — 107 MCP tools for invoicing, reconciliation, reporting, and financial operations.",
  endpoint: `${MCP_PUBLIC_URL}/mcp`,
  transport: "streamable-http",
  icons: [
    { src: `${MCP_PUBLIC_URL}/icon.png`, mimeType: "image/png", sizes: ["128x128"], theme: "light" },
    { src: `${MCP_PUBLIC_URL}/icon-light.png`, mimeType: "image/png", sizes: ["128x128"], theme: "dark" },
  ],
  authentication: {
    type: "oauth2",
    protected_resource_metadata: `${MCP_PUBLIC_URL}/.well-known/oauth-protected-resource`,
    authorization_server_metadata: `${APP_URL}/.well-known/oauth-authorization-server`,
    api_key: { prefix: "cak_", header: "Authorization", scheme: "Bearer" },
  },
  capabilities: { tools: 107, prompts: 9, resources: 6, apps: 6 },
  api: {
    openapi_url: `${APP_URL}/api/v1/openapi`,
    docs_url: `${APP_URL}/api/docs`,
  },
});

// ── Transport selection ──────────────────────────────────────────
// MCP_TRANSPORT=http  → Streamable HTTP on MCP_PORT (default 3100)
// MCP_TRANSPORT=stdio → stdio (default)

const transport = process.env.MCP_TRANSPORT || "stdio";
const port = parseInt(process.env.MCP_PORT || "3100", 10);

// ── Rate limiting ────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = parseInt(process.env.MCP_RATE_LIMIT || "120", 10);

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // Emergency eviction if map grows too large (e.g., many distinct tenants)
  if (rateLimitMap.size > 10_000) {
    for (const [k, e] of rateLimitMap) {
      if (now >= e.resetAt) rateLimitMap.delete(k);
      if (rateLimitMap.size <= 5_000) break;
    }
  }

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  entry.count++;
  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
    resetAt: entry.resetAt,
  };
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(key);
  }
}, 300_000).unref();

// ── Session management (HTTP mode) ──────────────────────────────

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  tenant: Tenant;
  apiKeyRecord: ApiKeyRecord;
  lastActivityAt: number;
}

const sessions = new Map<string, Session>();

const MAX_SESSIONS = parseInt(process.env.MCP_MAX_SESSIONS || "1000", 10);
const MAX_SESSIONS_PER_TENANT = parseInt(process.env.MCP_MAX_SESSIONS_PER_TENANT || "20", 10);

// Clean up stale sessions every 10 minutes (sessions inactive for 1 hour)
const SESSION_TTL_MS = 3_600_000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      session.server.close().catch(() => {});
      session.transport.close().catch(() => {});
      sessions.delete(id);
      log.info("Session expired", { sessionId: id });
    }
  }
}, 600_000).unref();

// ── HTTP request handler ─────────────────────────────────────────

async function authenticate(req: IncomingMessage): Promise<{ tenant: Tenant; record: ApiKeyRecord } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;

  // Try API key first if it has the cak_ prefix, otherwise try OAuth token
  const record = token.startsWith("cak_")
    ? await resolveApiKey(token)
    : await resolveOAuthToken(token);
  if (!record) return null;

  return { tenant: apiKeyToTenant(record), record };
}

function setRateLimitHeaders(res: ServerResponse, remaining: number, resetAt: number): void {
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));
}

function sendJson(res: ServerResponse, status: number, body: unknown, requestId?: string): void {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(json)),
  };
  if (requestId) headers["X-Request-Id"] = requestId;
  res.writeHead(status, headers);
  res.end(json);
}

/**
 * Create a new MCP session (transport + server), handle the request, and store
 * the session for future use. Used for both initial session creation and stale
 * session recovery. Wrapped in try/finally to prevent transport/server leaks.
 */
async function createAndStoreSession(
  req: IncomingMessage,
  res: ServerResponse,
  tenant: Tenant,
  record: ApiKeyRecord,
  requestId: string,
  rlog: ReturnType<typeof withRequestId>,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  const mcpServer = createServer(tenant, record);

  try {
    await mcpServer.connect(transport);
    res.setHeader("X-Request-Id", requestId);
    await transport.handleRequest(req, res);

    const sid = transport.sessionId;
    if (sid) {
      sessions.set(sid, {
        transport,
        server: mcpServer,
        tenant,
        apiKeyRecord: record,
        lastActivityAt: Date.now(),
      });
      transport.onclose = () => {
        sessions.delete(sid);
        log.info("Session closed", { sessionId: sid });
      };
      rlog.info("Session created", {
        sessionId: sid,
        tenant: tenant.column,
        tenantId: tenant.value,
      });
    } else {
      await transport.close();
      await mcpServer.close();
    }
  } catch (err) {
    await transport.close().catch(() => {});
    await mcpServer.close().catch(() => {});
    throw err;
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = randomUUID();
  const rlog = withRequestId(requestId);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  // ── CORS (only for /mcp endpoint and OPTIONS preflight) ──
  if (path === "/mcp" || req.method === "OPTIONS") {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Payment, X-Payment");
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }
  }

  // ── Health check ──
  if (path === "/health" && req.method === "GET") {
    try {
      await healthCheck();
      const pool = getPoolStats();
      const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const poolUtilization = pool.total > 0 ? (pool.total - pool.idle) / pool.total : 0;
      const status = poolUtilization > 0.8 ? "degraded" : "ok";

      sendJson(res, status === "ok" ? 200 : 503, {
        status,
        version: VERSION,
        transport: "http",
        uptime: uptimeSeconds,
        db: { ok: true, pool },
        sessions: { active: sessions.size },
      });
    } catch {
      sendJson(res, 503, { status: "error", message: "Database unavailable" });
    }
    return;
  }

  // ── Readiness probe ──
  if (path === "/ready" && req.method === "GET") {
    try {
      await healthCheck();
      sendJson(res, 200, { ready: true });
    } catch {
      sendJson(res, 503, { ready: false });
    }
    return;
  }

  // ── Prometheus metrics (token-protected, closed by default) ──
  if (path === "/metrics" && req.method === "GET") {
    if (!METRICS_AUTH_TOKEN) {
      sendJson(res, 403, { error: "Metrics endpoint requires METRICS_AUTH_TOKEN to be configured" });
      return;
    }
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${METRICS_AUTH_TOKEN}`) {
      res.writeHead(401, { "WWW-Authenticate": 'Bearer realm="metrics"' });
      res.end();
      return;
    }
    const body = serializeMetrics();
    res.writeHead(200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
    });
    res.end(body);
    return;
  }

  // ── Icons (public, no auth) ──
  if (path === "/icon.png" && req.method === "GET") {
    if (iconBuffer) {
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": iconBuffer.length,
        "Cache-Control": "public, max-age=86400",
      });
      res.end(iconBuffer);
    } else {
      sendJson(res, 404, { error: "Icon not found" });
    }
    return;
  }
  if (path === "/icon-light.png" && req.method === "GET") {
    if (iconLightBuffer) {
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": iconLightBuffer.length,
        "Cache-Control": "public, max-age=86400",
      });
      res.end(iconLightBuffer);
    } else {
      sendJson(res, 404, { error: "Icon not found" });
    }
    return;
  }

  // ── MCP Service Discovery (pre-built at startup) ──
  if (path === "/.well-known/mcp.json" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(mcpDescriptorJson)),
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(mcpDescriptorJson);
    return;
  }

  // ── OAuth Protected Resource Metadata (RFC 9728) ──
  if (path === "/.well-known/oauth-protected-resource" && req.method === "GET") {
    const resource = process.env.MCP_RESOURCE_URL;
    if (!resource) {
      sendJson(res, 500, {
        error: "MCP_RESOURCE_URL environment variable is not configured",
      }, requestId);
      return;
    }
    const issuer = process.env.MCP_ISSUER_URL || "https://app.cynco.io";
    res.setHeader("Access-Control-Allow-Origin", "*");

    sendJson(res, 200, {
      resource,
      authorization_servers: [issuer],
      scopes_supported: ["read", "write", "query:execute", "code:execute", ...ALL_MODULE_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "Cynco Accounting MCP Server",
      resource_documentation: "https://github.com/cynco-tech/cynco-mcp",
    }, requestId);
    return;
  }

  // ── MCP endpoint ──
  if (path === "/mcp") {
    // Authenticate every request
    const auth = await authenticate(req);
    if (!auth) {
      authFailuresTotal.inc({ reason: "invalid_or_missing" });
      rlog.warn("Auth failed", { url: req.url, method: req.method });
      res.setHeader("WWW-Authenticate", 'Bearer realm="cynco-mcp", error="invalid_token"');
      sendJson(res, 401, { error: "Invalid or missing API key. Use Authorization: Bearer <key>" }, requestId);
      return;
    }

    const { tenant, record } = auth;

    // Rate limit by tenant
    const rateLimit = checkRateLimit(tenant.value);
    setRateLimitHeaders(res, rateLimit.remaining, rateLimit.resetAt);

    if (!rateLimit.allowed) {
      rateLimitHitsTotal.inc({ tenant_type: tenant.column === "client_id" ? "client" : "firm" });
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      res.setHeader("Retry-After", retryAfter);
      rlog.warn("Rate limited", { tenant: tenant.value });
      sendJson(res, 429, { error: "Rate limit exceeded. Try again in a minute." }, requestId);
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "POST") {
      if (sessionId && sessions.has(sessionId)) {
        // Existing session — verify tenant AND API key identity
        const session = sessions.get(sessionId)!;
        if (session.tenant.value !== tenant.value || session.apiKeyRecord.id !== record.id) {
          sendJson(res, 403, { error: "Session tenant or API key mismatch" }, requestId);
          return;
        }

        // Check for scope changes — if the key's scopes were narrowed since session
        // creation, tear down the stale session and force re-initialization so the
        // new MCP server instance uses the current (narrower) scopes
        const oldScopes = session.apiKeyRecord.scopes.slice().sort().join(",");
        const newScopes = record.scopes.slice().sort().join(",");
        if (oldScopes !== newScopes) {
          rlog.info("Session terminated due to scope change", { sessionId, oldScopes, newScopes });
          await session.server.close().catch(() => {});
          await session.transport.close().catch(() => {});
          sessions.delete(sessionId);
          await createAndStoreSession(req, res, tenant, record, requestId, rlog);
          return;
        }

        session.lastActivityAt = Date.now();
        res.setHeader("X-Request-Id", requestId);
        await session.transport.handleRequest(req, res);
      } else if (!sessionId) {
        // No session ID — must be an initialize request
        // Enforce session limits to prevent memory exhaustion
        if (sessions.size >= MAX_SESSIONS) {
          rlog.warn("Global session limit reached", { max: MAX_SESSIONS, current: sessions.size });
          sendJson(res, 503, { error: "Server at session capacity. Try again later." }, requestId);
          return;
        }
        let tenantSessionCount = 0;
        for (const [, s] of sessions) {
          if (s.tenant.value === tenant.value) tenantSessionCount++;
        }
        if (tenantSessionCount >= MAX_SESSIONS_PER_TENANT) {
          rlog.warn("Per-tenant session limit reached", { tenant: tenant.value, max: MAX_SESSIONS_PER_TENANT });
          sendJson(res, 429, { error: "Too many active sessions for this tenant. Close existing sessions or wait for expiry." }, requestId);
          return;
        }
        await createAndStoreSession(req, res, tenant, record, requestId, rlog);
      } else {
        // Session ID provided but not found (expired, terminated, or stale).
        // Return 404 per MCP protocol — the client must send a new initialize
        // request (POST without Mcp-Session-Id) to establish a fresh session.
        rlog.info("Stale session rejected", { staleSessionId: sessionId });
        sendJson(res, 404, { error: "Session not found. Send a new request without Mcp-Session-Id to initialize." }, requestId);
      }
      return;
    }

    if (req.method === "GET") {
      // SSE stream for server-sent notifications
      if (!sessionId || !sessions.has(sessionId)) {
        sendJson(res, 400, { error: "Missing or invalid session ID" }, requestId);
        return;
      }
      const session = sessions.get(sessionId)!;
      if (session.tenant.value !== tenant.value || session.apiKeyRecord.id !== record.id) {
        sendJson(res, 403, { error: "Session tenant or API key mismatch" }, requestId);
        return;
      }
      session.lastActivityAt = Date.now();
      res.setHeader("X-Request-Id", requestId);
      await session.transport.handleRequest(req, res);
      return;
    }

    if (req.method === "DELETE") {
      // Session termination
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        if (session.tenant.value !== tenant.value || session.apiKeyRecord.id !== record.id) {
          sendJson(res, 403, { error: "Session tenant or API key mismatch" }, requestId);
          return;
        }
        await session.server.close().catch(() => {});
        await session.transport.close();
        sessions.delete(sessionId);
        rlog.info("Session terminated by client", { sessionId });
      }
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(405, { Allow: "GET, POST, DELETE" });
    res.end();
    return;
  }

  // ── 404 ──
  sendJson(res, 404, { error: "Not found. MCP endpoint is at /mcp" }, requestId);
}

// ── Startup validation ──────────────────────────────────────────

function validateConfig(): void {
  const errors: string[] = [];

  if (!process.env.CYNCO_DATABASE_URL) {
    errors.push("CYNCO_DATABASE_URL is required");
  }

  if (transport === "http") {
    if (port < 1 || port > 65535 || isNaN(port)) {
      errors.push(`MCP_PORT must be 1-65535, got: ${process.env.MCP_PORT}`);
    }
  }

  if (RATE_LIMIT_MAX < 1 || isNaN(RATE_LIMIT_MAX)) {
    errors.push(`MCP_RATE_LIMIT must be a positive integer, got: ${process.env.MCP_RATE_LIMIT}`);
  }

  const poolMax = parseInt(process.env.MCP_DB_POOL_MAX || "5", 10);
  if (poolMax < 1 || poolMax > 100 || isNaN(poolMax)) {
    errors.push(`MCP_DB_POOL_MAX must be 1-100, got: ${process.env.MCP_DB_POOL_MAX}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      log.error("Config validation failed", { error });
    }
    process.exit(1);
  }
}

// ── Startup ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  validateConfig();
  await healthCheck();

  // Register Prometheus gauges
  registerDbPoolGauge(getPoolStats);
  registerSessionsGauge(() => sessions.size);

  if (transport === "http") {
    const httpServer = createHttpServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        const requestId = res.getHeader("X-Request-Id") as string | undefined;
        log.error("Unhandled request error", {
          error: String(err),
          stack: err instanceof Error ? err.stack : undefined,
          url: req.url,
          method: req.method,
          requestId,
        });
        if (!res.headersSent) {
          const isProduction = process.env.NODE_ENV === "production";
          sendJson(res, 500, {
            error: isProduction
              ? `Internal server error (ref: ${requestId})`
              : String(err),
            requestId,
          }, requestId);
        }
      });
    });

    httpServer.listen(port, () => {
      log.info("MCP HTTP server started", { version: VERSION, port, rateLimit: RATE_LIMIT_MAX });
    });

    // Graceful shutdown
    const stop = async () => {
      log.info("Shutting down HTTP server");
      for (const [, session] of sessions) {
        await session.transport.close().catch(() => {});
      }
      httpServer.close();
      await shutdown();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } else {
    // stdio transport — no auth, tenant from tool params
    const server = createServer();
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);

    log.info("MCP stdio server started", { version: VERSION });

    const stop = async () => {
      await shutdown();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
}

main().catch((error) => {
  log.error("Fatal error starting MCP server", { error: String(error), stack: error instanceof Error ? error.stack : undefined });
  process.exit(1);
});
