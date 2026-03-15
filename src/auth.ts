import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";
import { log } from "./logger.js";
import type { Tenant } from "./utils/validation.js";

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

  // Update last_used_at (fire-and-forget, don't block auth)
  query("UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]).catch((err) =>
    log.warn("Failed to update last_used_at", { keyId: row.id, error: String(err) }),
  );

  return {
    id: row.id as string,
    tenantType: row.tenant_type as "client" | "accounting_firm",
    tenantId: row.tenant_id as string,
    name: row.name as string,
    scopes: (row.scopes as string[]) || [],
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
 * - "read" = read-only tools
 * - "write" = write tools (implies read)
 * - "query:execute" = execute_query tool (dangerous, explicit opt-in)
 */
export type ToolScope = "read" | "write" | "query:execute";

export function checkScope(record: ApiKeyRecord, required: ToolScope): boolean {
  // Empty scopes = unrestricted (backwards compat for keys created before scopes)
  if (record.scopes.length === 0) return true;

  if (required === "read") {
    return record.scopes.some((s) => s === "read" || s === "write");
  }
  if (required === "write") {
    return record.scopes.includes("write");
  }
  if (required === "query:execute") {
    return record.scopes.includes("query:execute");
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
