/**
 * Unit tests for resolveApiKey() and resolveOAuthToken().
 *
 * These are the two database-touching auth functions that weren't tested.
 * Covers: token lookup, revocation, expiry, resource validation (RFC 8707),
 * trailing slash normalization, empty scope rejection, and throttled updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { resolveApiKey, resolveOAuthToken, hashApiKey } from "../src/auth.js";

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock("../src/db.js", () => ({
    query: vi.fn(),
}));

vi.mock("../src/logger.js", () => ({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    withRequestId: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { query } from "../src/db.js";

const mockQuery = vi.mocked(query);

const EMPTY_RESULT = { rows: [], rowCount: 0, command: "SELECT", oid: 0, fields: [] };

function makeApiKeyRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "mak_test_001",
        tenant_type: "client",
        tenant_id: "client_abc",
        name: "Test Key",
        scopes: ["read", "write"],
        ...overrides,
    };
}

function makeOAuthTokenRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "oat_test_001",
        tenant_type: "client",
        tenant_id: "client_abc",
        client_id: "cynco_cid_test",
        scopes: ["read", "write"],
        resource: null,
        ...overrides,
    };
}

function queryResult(rows: Record<string, unknown>[]) {
    return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

// ── resolveApiKey ────────────────────────────────────────────────────

describe("resolveApiKey", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns tenant record for valid active key", async () => {
        // Two calls: SELECT (lookup) + UPDATE (throttled last_used_at)
        mockQuery.mockResolvedValue(queryResult([makeApiKeyRow({ id: "mak_valid_001" })]));

        const result = await resolveApiKey("cak_valid_key_123");

        expect(result).not.toBeNull();
        expect(result!.id).toBe("mak_valid_001");
        expect(result!.tenantType).toBe("client");
        expect(result!.tenantId).toBe("client_abc");
        expect(result!.scopes).toEqual(["read", "write"]);
    });

    it("hashes the key before querying", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([makeApiKeyRow()]));

        await resolveApiKey("cak_my_key");

        const expectedHash = hashApiKey("cak_my_key");
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("WHERE key_hash = $1"),
            [expectedHash],
        );
    });

    it("returns null for unknown key", async () => {
        mockQuery.mockResolvedValueOnce(EMPTY_RESULT);

        const result = await resolveApiKey("cak_nonexistent");

        expect(result).toBeNull();
    });

    it("returns null for inactive key (filtered by SQL)", async () => {
        // The SQL includes `AND is_active = true`, so inactive keys return 0 rows
        mockQuery.mockResolvedValueOnce(EMPTY_RESULT);

        const result = await resolveApiKey("cak_inactive");

        expect(result).toBeNull();
    });

    it("returns null for expired key (filtered by SQL)", async () => {
        mockQuery.mockResolvedValueOnce(EMPTY_RESULT);

        const result = await resolveApiKey("cak_expired");

        expect(result).toBeNull();
    });

    it("treats null scopes as empty array", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([makeApiKeyRow({ scopes: null })]));

        const result = await resolveApiKey("cak_null_scopes");

        expect(result!.scopes).toEqual([]);
    });

    it("fires throttled last_used_at update via touchLastUsed", async () => {
        const uniqueId = `mak_throttle_${Date.now()}`;
        mockQuery.mockResolvedValue(queryResult([makeApiKeyRow({ id: uniqueId })]));

        await resolveApiKey("cak_throttle_test");

        // SELECT query + fire-and-forget UPDATE from touchLastUsed
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockQuery).toHaveBeenLastCalledWith(
            expect.stringContaining("UPDATE mcp_api_keys SET last_used_at"),
            [uniqueId],
        );
    });
});

// ── resolveOAuthToken ────────────────────────────────────────────────

describe("resolveOAuthToken", () => {
    const originalEnv = process.env.MCP_RESOURCE_URL;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.MCP_RESOURCE_URL = "https://mcp.cynco.io";
    });

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.MCP_RESOURCE_URL = originalEnv;
        } else {
            delete process.env.MCP_RESOURCE_URL;
        }
    });

    // ── Happy path ──

    it("returns tenant record for valid token", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([makeOAuthTokenRow()]));

        const result = await resolveOAuthToken("cynco_at_valid_token");

        expect(result).not.toBeNull();
        expect(result!.id).toBe("oat_test_001");
        expect(result!.tenantType).toBe("client");
        expect(result!.tenantId).toBe("client_abc");
        expect(result!.name).toBe("OAuth (cynco_cid_test)");
        expect(result!.scopes).toEqual(["read", "write"]);
    });

    it("returns accounting firm tenant correctly", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ tenant_type: "accounting_firm", tenant_id: "accfirm_xyz" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_firm_token");

        expect(result!.tenantType).toBe("accounting_firm");
        expect(result!.tenantId).toBe("accfirm_xyz");
    });

    // ── Token not found / revoked / expired ──

    it("returns null for unknown token", async () => {
        mockQuery.mockResolvedValueOnce(EMPTY_RESULT);

        expect(await resolveOAuthToken("cynco_at_nonexistent")).toBeNull();
    });

    it("returns null for revoked token (filtered by SQL)", async () => {
        mockQuery.mockResolvedValueOnce(EMPTY_RESULT);

        expect(await resolveOAuthToken("cynco_at_revoked")).toBeNull();
    });

    it("returns null for expired token (filtered by SQL)", async () => {
        mockQuery.mockResolvedValueOnce(EMPTY_RESULT);

        expect(await resolveOAuthToken("cynco_at_expired")).toBeNull();
    });

    // ── RFC 8707 Resource validation ──

    it("accepts token with matching resource", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: "https://mcp.cynco.io" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_matching_resource");

        expect(result).not.toBeNull();
    });

    it("accepts token with null resource (no binding)", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: null }),
        ]));

        const result = await resolveOAuthToken("cynco_at_null_resource");

        expect(result).not.toBeNull();
    });

    it("rejects token with mismatched resource", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: "https://other-server.example.com" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_wrong_resource");

        expect(result).toBeNull();
    });

    it("normalizes trailing slash — token with slash matches server without", async () => {
        process.env.MCP_RESOURCE_URL = "https://mcp.cynco.io";
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: "https://mcp.cynco.io/" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_trailing_slash");

        expect(result).not.toBeNull();
    });

    it("normalizes trailing slash — server with slash matches token without", async () => {
        process.env.MCP_RESOURCE_URL = "https://mcp.cynco.io/";
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: "https://mcp.cynco.io" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_server_trailing_slash");

        expect(result).not.toBeNull();
    });

    it("normalizes multiple trailing slashes", async () => {
        process.env.MCP_RESOURCE_URL = "https://mcp.cynco.io";
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: "https://mcp.cynco.io///" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_multi_slash");

        expect(result).not.toBeNull();
    });

    it("accepts token when MCP_RESOURCE_URL is not set", async () => {
        delete process.env.MCP_RESOURCE_URL;
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ resource: "https://mcp.cynco.io" }),
        ]));

        const result = await resolveOAuthToken("cynco_at_no_server_resource");

        // serverResource is undefined → check skipped → accepted
        expect(result).not.toBeNull();
    });

    // ── Empty scopes rejection ──

    it("rejects token with empty scopes array", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ scopes: [] }),
        ]));

        const result = await resolveOAuthToken("cynco_at_empty_scopes");

        expect(result).toBeNull();
    });

    it("rejects token with null scopes", async () => {
        mockQuery.mockResolvedValueOnce(queryResult([
            makeOAuthTokenRow({ scopes: null }),
        ]));

        const result = await resolveOAuthToken("cynco_at_null_scopes");

        expect(result).toBeNull();
    });

    // ── Throttled update ──

    it("fires throttled last_used_at update via touchLastUsed", async () => {
        const uniqueId = `oat_throttle_${Date.now()}`;
        mockQuery.mockResolvedValue(queryResult([makeOAuthTokenRow({ id: uniqueId })]));

        await resolveOAuthToken("cynco_at_throttle_unique");

        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockQuery).toHaveBeenLastCalledWith(
            expect.stringContaining("UPDATE oauth_access_tokens SET last_used_at"),
            [uniqueId],
        );
    });
});

// ── Module scope + code:execute (extending scope.test.ts) ────────────

import { checkScope } from "../src/auth.js";

describe("checkScope — module scopes and code:execute", () => {
    function makeRecord(scopes: string[]) {
        return { id: "mak_t", tenantType: "client" as const, tenantId: "c", name: "T", scopes };
    }

    it("module:read grants specific module read", () => {
        expect(checkScope(makeRecord(["accounting:read"]), "accounting:read")).toBe(true);
    });

    it("module:write grants module read (write implies read)", () => {
        expect(checkScope(makeRecord(["invoicing:write"]), "invoicing:read")).toBe(true);
    });

    it("module:read denies different module", () => {
        expect(checkScope(makeRecord(["accounting:read"]), "invoicing:read")).toBe(false);
    });

    it("module:write denies different module", () => {
        expect(checkScope(makeRecord(["accounting:write"]), "invoicing:write")).toBe(false);
    });

    it("legacy read grants any module:read", () => {
        expect(checkScope(makeRecord(["read"]), "customers:read")).toBe(true);
        expect(checkScope(makeRecord(["read"]), "vendors:read")).toBe(true);
        expect(checkScope(makeRecord(["read"]), "assets:read")).toBe(true);
    });

    it("legacy write grants any module:write", () => {
        expect(checkScope(makeRecord(["write"]), "customers:write")).toBe(true);
        expect(checkScope(makeRecord(["write"]), "vendors:write")).toBe(true);
    });

    it("code:execute requires explicit opt-in", () => {
        expect(checkScope(makeRecord(["read", "write"]), "code:execute")).toBe(false);
        expect(checkScope(makeRecord(["code:execute"]), "code:execute")).toBe(true);
    });

    it("code:execute does not grant read or write", () => {
        expect(checkScope(makeRecord(["code:execute"]), "read")).toBe(false);
        expect(checkScope(makeRecord(["code:execute"]), "write")).toBe(false);
    });
});
