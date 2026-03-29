import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";
import { log } from "./logger.js";
import type { Tenant } from "./utils/validation.js";

// Throttle last_used_at updates to at most once per 5 minutes per credential.
// Prevents write storms under sustained MCP traffic (120 req/min = 120 UPDATEs/min → 1).
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;
const lastUsedCache = new Map<string, number>();

// Evict stale entries from the lastUsedCache to prevent unbounded growth.
setInterval(() => {
  const cutoff = Date.now() - LAST_USED_THROTTLE_MS;
  for (const [key, ts] of lastUsedCache) {
    if (ts < cutoff) lastUsedCache.delete(key);
  }
}, LAST_USED_THROTTLE_MS).unref();

/** Fire-and-forget last_used_at update, throttled to at most once per 5 min per credential. */
function touchLastUsed(table: "mcp_api_keys" | "oauth_access_tokens", id: string): void {
  const key = `${table}:${id}`;
  const now = Date.now();
  if (now - (lastUsedCache.get(key) ?? 0) > LAST_USED_THROTTLE_MS) {
    lastUsedCache.set(key, now);
    query(`UPDATE ${table} SET last_used_at = NOW() WHERE id = $1`, [id]).catch(() => {});
  }
}

export interface ApiKeyRecord {
  id: string;
  tenantType: "client" | "accounting_firm";
  tenantId: string;
  name: string;
  scopes: string[];
}

/**
 * Hash an API key with SHA-256 for secure storage/lookup.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Generate a new API key with prefix `cak_` (cynco api key).
 * Returns the raw key (show once), hash (store), and prefix (display).
 */
export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const bytes = randomBytes(32);
  const rawKey = `cak_${bytes.toString("base64url")}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12) + "...";
  return { rawKey, keyHash, keyPrefix };
}

/**
 * Look up an API key by its raw value.
 * Returns the tenant info if valid and active, null otherwise.
 */
export async function resolveApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(rawKey);

  const result = await query(
    `SELECT id, tenant_type, tenant_id, name, scopes
     FROM mcp_api_keys
     WHERE key_hash = $1
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [keyHash],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  touchLastUsed("mcp_api_keys", row.id as string);

  return {
    id: row.id as string,
    tenantType: row.tenant_type as "client" | "accounting_firm",
    tenantId: row.tenant_id as string,
    name: row.name as string,
    scopes: (row.scopes as string[]) || [],
  };
}

/**
 * Look up an OAuth access token by its raw value.
 * Returns the tenant info if valid, not revoked, and not expired; null otherwise.
 */
export async function resolveOAuthToken(rawToken: string): Promise<ApiKeyRecord | null> {
  const tokenHash = hashApiKey(rawToken);

  const result = await query(
    `SELECT id, tenant_type, tenant_id, client_id, scopes, resource
     FROM oauth_access_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [tokenHash],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // RFC 8707: if the token was issued for a specific resource, verify it
  // matches this server's resource URL (prevents token misuse across services).
  // Normalize trailing slashes — Claude.ai sends "https://host/" while the
  // server config typically omits the trailing slash.
  const tokenResource = (row.resource as string | null)?.replace(/\/+$/, "") || null;
  const serverResource = process.env.MCP_RESOURCE_URL?.replace(/\/+$/, "");
  if (tokenResource && serverResource && tokenResource !== serverResource) {
    log.warn("OAuth token resource mismatch — rejecting", {
      tokenId: row.id as string,
      tokenResource,
      serverResource,
    });
    return null;
  }

  touchLastUsed("oauth_access_tokens", row.id as string);

  const scopes = (row.scopes as string[]) || [];

  // OAuth tokens must have explicit scopes — reject tokens with empty scopes
  // to prevent null/empty scopes from granting full access via checkScope()
  if (scopes.length === 0) {
    log.warn("OAuth token has empty scopes — rejecting to prevent full-access grant", {
      tokenId: row.id as string,
      clientId: row.client_id as string,
    });
    return null;
  }

  return {
    id: row.id as string,
    tenantType: row.tenant_type as "client" | "accounting_firm",
    tenantId: row.tenant_id as string,
    name: `OAuth (${row.client_id as string})`,
    scopes,
  };
}

/**
 * Convert an ApiKeyRecord to a Tenant for use in tool handlers.
 */
export function apiKeyToTenant(record: ApiKeyRecord): Tenant {
  if (record.tenantType === "client") {
    return {
      column: "client_id",
      value: record.tenantId,
      clientId: record.tenantId,
      accountingFirmId: null,
    };
  }
  return {
    column: "accounting_firm_id",
    value: record.tenantId,
    clientId: null,
    accountingFirmId: record.tenantId,
  };
}

/**
 * Check whether the API key's scopes allow a given operation.
 *
 * Scope rules:
 * - Empty scopes array = full access (backwards compatible with existing keys)
 * - Legacy "read" matches any module:read scope
 * - Legacy "write" matches any module:write scope (and implies read)
 * - Module-level scopes: "accounting:read", "invoicing:write", etc.
 * - Module write implies module read (e.g. "accounting:write" grants "accounting:read")
 * - "query:execute" = execute_query tool (dangerous, explicit opt-in)
 */
export type ModuleScope =
  | "accounting:read" | "accounting:write"
  | "invoicing:read" | "invoicing:write"
  | "customers:read" | "customers:write"
  | "vendors:read" | "vendors:write"
  | "reports:read"
  | "dataroom:read" | "dataroom:write"
  | "agreements:read" | "agreements:write"
  | "assets:read" | "assets:write"
  | "admin:read" | "admin:write"
  | "tags:read" | "tags:write";

export type ToolScope = "read" | "write" | "query:execute" | "code:execute" | ModuleScope;

export const ALL_MODULE_SCOPES: ModuleScope[] = [
  "accounting:read", "accounting:write",
  "invoicing:read", "invoicing:write",
  "customers:read", "customers:write",
  "vendors:read", "vendors:write",
  "reports:read",
  "dataroom:read", "dataroom:write",
  "agreements:read", "agreements:write",
  "assets:read", "assets:write",
  "admin:read", "admin:write",
  "tags:read", "tags:write",
];

export function checkScope(record: ApiKeyRecord, required: ToolScope): boolean {
  // Empty scopes = unrestricted (backwards compat for keys created before scopes)
  // Log a warning so these legacy keys are visible in production observability
  if (record.scopes.length === 0) {
    log.warn("API key with empty scopes granted full access — migrate to explicit scopes", {
      keyId: record.id,
      tenantId: record.tenantId,
      required,
    });
    return true;
  }

  const scopes = record.scopes;

  // Direct match
  if (scopes.includes(required)) return true;

  // Legacy coarse-grained scope mapping
  if (required === "read" || required.endsWith(":read")) {
    // Legacy "read" grants any read scope; legacy "write" also grants read
    if (scopes.includes("read") || scopes.includes("write")) return true;
  }
  if (required === "write" || required.endsWith(":write")) {
    if (scopes.includes("write")) return true;
  }

  // Module write implies module read (e.g., "accounting:write" grants "accounting:read")
  if (required.endsWith(":read")) {
    const module = required.replace(":read", ":write");
    if (scopes.includes(module)) return true;
  }

  // query:execute and code:execute require explicit opt-in
  if (required === "query:execute") {
    return scopes.includes("query:execute");
  }
  if (required === "code:execute") {
    return scopes.includes("code:execute");
  }

  return false;
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
