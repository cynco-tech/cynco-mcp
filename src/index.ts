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
import { extractBearerToken, resolveApiKey, apiKeyToTenant } from "./auth.js";
import type { ApiKeyRecord } from "./auth.js";
import { log, withRequestId } from "./logger.js";
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

// ── Static assets (loaded once at startup) ───────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
let iconBuffer: Buffer | null = null;
try {
  iconBuffer = readFileSync(join(__dirname, "..", "assets", "icon.png"));
} catch {
  // Icon file missing — not fatal, /icon.png will 404
}

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

// Clean up stale sessions every 10 minutes (sessions inactive for 1 hour)
const SESSION_TTL_MS = 3_600_000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
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

  const record = await resolveApiKey(token);
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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = randomUUID();
  const rlog = withRequestId(requestId);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  // ── Health check ──
  if (path === "/health" && req.method === "GET") {
    try {
      await healthCheck();
      const pool = getPoolStats();
      const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const poolUtilization = pool.total > 0 ? (pool.total - pool.idle) / pool.total : 0;
      const status = poolUtilization > 0.8 ? "degraded" : "ok";

      sendJson(res, status === "ok" ? 200 : 200, {
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

  // ── Prometheus metrics ──
  if (path === "/metrics" && req.method === "GET") {
    const body = serializeMetrics();
    res.writeHead(200, {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
    });
    res.end(body);
    return;
  }

  // ── Icon (public, no auth) ──
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

  // ── MCP endpoint ──
  if (path === "/mcp") {
    // Authenticate every request
    const auth = await authenticate(req);
    if (!auth) {
      authFailuresTotal.inc({ reason: "invalid_or_missing" });
      rlog.warn("Auth failed", { url: req.url, method: req.method });
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
        session.lastActivityAt = Date.now();
        res.setHeader("X-Request-Id", requestId);
        await session.transport.handleRequest(req, res);
      } else if (!sessionId) {
        // No session ID — must be an initialize request; create transport + server
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const server = createServer(tenant, record);
        await server.connect(newTransport);

        // handleRequest processes initialize and generates the session ID
        res.setHeader("X-Request-Id", requestId);
        await newTransport.handleRequest(req, res);

        // Store session AFTER handleRequest so sessionId is populated
        const newSessionId = newTransport.sessionId;
        if (newSessionId) {
          sessions.set(newSessionId, {
            transport: newTransport,
            server,
            tenant,
            apiKeyRecord: record,
            lastActivityAt: Date.now(),
          });

          newTransport.onclose = () => {
            sessions.delete(newSessionId);
            log.info("Session closed", { sessionId: newSessionId });
          };

          rlog.info("Session created", {
            sessionId: newSessionId,
            tenant: tenant.column,
            tenantId: tenant.value,
          });
        } else {
          // No session ID generated — clean up the orphaned transport/server
          await newTransport.close();
          await server.close();
        }
      } else {
        // Has session ID but not found (expired or invalid)
        sendJson(res, 404, { error: "Session not found or expired" }, requestId);
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
