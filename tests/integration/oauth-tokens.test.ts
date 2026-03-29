/**
 * Integration tests for OAuth token resolution against a real database.
 *
 * Tests the full lifecycle: insert token → resolve → verify resource check,
 * scope validation, revocation, and expiry behavior.
 *
 * Requires the test Postgres to be running:
 *   cd remix && pnpm run test:db:up
 *   cd remix && DATABASE_URL=postgresql://cynco_test:cynco_test@localhost:5434/cynco_test pnpm drizzle-kit push
 *   CYNCO_DATABASE_URL=postgresql://cynco_test:cynco_test@localhost:5434/cynco_test pnpm test:integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
    seedTestData,
    cleanupTestData,
    shutdownTestDb,
    testQuery,
    TEST_CLIENT_ID,
    TEST_USER_ID,
} from "./setup.js";

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_OAUTH_CLIENT_ID = "cynco_cid_integration_test";

function generateToken(): { raw: string; hash: string } {
    const raw = `cynco_at_${randomBytes(32).toString("base64url")}`;
    const hash = createHash("sha256").update(raw).digest("hex");
    return { raw, hash };
}

async function insertOAuthClient(): Promise<void> {
    await testQuery(
        `INSERT INTO oauth_clients (id, client_id, client_name, redirect_uris, is_active)
         VALUES ($1, $2, 'Test MCP Client', ARRAY['https://localhost/callback'], true)
         ON CONFLICT (id) DO NOTHING`,
        ["oac_integration_test", TEST_OAUTH_CLIENT_ID],
    );
}

async function insertAccessToken(opts: {
    id: string;
    tokenHash: string;
    scopes: string[];
    resource?: string | null;
    expiresAt?: Date;
    revokedAt?: Date | null;
}): Promise<void> {
    await testQuery(
        `INSERT INTO oauth_access_tokens
            (id, token_hash, client_id, user_id, tenant_type, tenant_id, scopes, resource, expires_at, revoked_at)
         VALUES ($1, $2, $3, $4, 'client', $5, $6, $7, $8, $9)`,
        [
            opts.id,
            opts.tokenHash,
            TEST_OAUTH_CLIENT_ID,
            TEST_USER_ID,
            TEST_CLIENT_ID,
            opts.scopes,
            opts.resource ?? null,
            opts.expiresAt ?? new Date(Date.now() + 3600_000), // 1 hour from now
            opts.revokedAt ?? null,
        ],
    );
}

async function insertApiKey(opts: {
    id: string;
    keyHash: string;
    scopes: string[];
    isActive?: boolean;
    expiresAt?: Date | null;
}): Promise<void> {
    await testQuery(
        `INSERT INTO mcp_api_keys
            (id, key_hash, key_prefix, tenant_type, tenant_id, name, scopes, is_active, expires_at)
         VALUES ($1, $2, 'cak_test...', 'client', $3, 'Integration Test Key', $4, $5, $6)`,
        [
            opts.id,
            opts.keyHash,
            TEST_CLIENT_ID,
            opts.scopes,
            opts.isActive ?? true,
            opts.expiresAt ?? null,
        ],
    );
}

// ── Setup / Teardown ─────────────────────────────────────────────────

afterAll(async () => {
    await shutdownTestDb();
});

// ── OAuth Token Tests ────────────────────────────────────────────────

describe("Integration: OAuth token resolution", () => {
    beforeAll(async () => {
        await seedTestData();
        await insertOAuthClient();
    });

    afterAll(async () => {
        // Clean up OAuth test data
        await testQuery("DELETE FROM oauth_access_tokens WHERE client_id = $1", [TEST_OAUTH_CLIENT_ID]);
        await testQuery("DELETE FROM oauth_clients WHERE client_id = $1", [TEST_OAUTH_CLIENT_ID]);
        await cleanupTestData();
    });

    // Import the function that hits the real DB
    // (the module reads CYNCO_DATABASE_URL from env, same as test pool)
    let resolveOAuthToken: typeof import("../../src/auth.js").resolveOAuthToken;

    beforeAll(async () => {
        const mod = await import("../../src/auth.js");
        resolveOAuthToken = mod.resolveOAuthToken;
    });

    it("resolves a valid token with correct scopes", async () => {
        const token = generateToken();
        await insertAccessToken({
            id: "oat_integ_valid_001",
            tokenHash: token.hash,
            scopes: ["read", "write", "accounting:read"],
        });

        const result = await resolveOAuthToken(token.raw);

        expect(result).not.toBeNull();
        expect(result!.id).toBe("oat_integ_valid_001");
        expect(result!.tenantType).toBe("client");
        expect(result!.tenantId).toBe(TEST_CLIENT_ID);
        expect(result!.scopes).toContain("read");
        expect(result!.scopes).toContain("accounting:read");
    });

    it("returns null for revoked token", async () => {
        const token = generateToken();
        await insertAccessToken({
            id: "oat_integ_revoked_001",
            tokenHash: token.hash,
            scopes: ["read"],
            revokedAt: new Date(),
        });

        expect(await resolveOAuthToken(token.raw)).toBeNull();
    });

    it("returns null for expired token", async () => {
        const token = generateToken();
        await insertAccessToken({
            id: "oat_integ_expired_001",
            tokenHash: token.hash,
            scopes: ["read"],
            expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        });

        expect(await resolveOAuthToken(token.raw)).toBeNull();
    });

    it("rejects token with empty scopes", async () => {
        const token = generateToken();
        await insertAccessToken({
            id: "oat_integ_empty_scopes_001",
            tokenHash: token.hash,
            scopes: [],
        });

        expect(await resolveOAuthToken(token.raw)).toBeNull();
    });

    it("returns null for completely unknown token", async () => {
        expect(await resolveOAuthToken("cynco_at_does_not_exist_anywhere")).toBeNull();
    });

    // ── RFC 8707 Resource validation ──

    describe("resource validation (RFC 8707)", () => {
        const originalResourceUrl = process.env.MCP_RESOURCE_URL;

        beforeEach(() => {
            process.env.MCP_RESOURCE_URL = "https://mcp.cynco.io";
        });

        afterAll(() => {
            if (originalResourceUrl !== undefined) {
                process.env.MCP_RESOURCE_URL = originalResourceUrl;
            } else {
                delete process.env.MCP_RESOURCE_URL;
            }
        });

        it("accepts token with matching resource", async () => {
            const token = generateToken();
            await insertAccessToken({
                id: "oat_integ_res_match_001",
                tokenHash: token.hash,
                scopes: ["read"],
                resource: "https://mcp.cynco.io",
            });

            expect(await resolveOAuthToken(token.raw)).not.toBeNull();
        });

        it("accepts token with null resource (no binding)", async () => {
            const token = generateToken();
            await insertAccessToken({
                id: "oat_integ_res_null_001",
                tokenHash: token.hash,
                scopes: ["read"],
                resource: null,
            });

            expect(await resolveOAuthToken(token.raw)).not.toBeNull();
        });

        it("rejects token with mismatched resource", async () => {
            const token = generateToken();
            await insertAccessToken({
                id: "oat_integ_res_mismatch_001",
                tokenHash: token.hash,
                scopes: ["read"],
                resource: "https://other-server.example.com",
            });

            expect(await resolveOAuthToken(token.raw)).toBeNull();
        });

        it("normalizes trailing slash — token 'host/' matches server 'host'", async () => {
            const token = generateToken();
            await insertAccessToken({
                id: "oat_integ_res_slash_001",
                tokenHash: token.hash,
                scopes: ["read"],
                resource: "https://mcp.cynco.io/",
            });

            const result = await resolveOAuthToken(token.raw);
            expect(result).not.toBeNull();
            expect(result!.id).toBe("oat_integ_res_slash_001");
        });

        it("normalizes trailing slash — server 'host/' matches token 'host'", async () => {
            process.env.MCP_RESOURCE_URL = "https://mcp.cynco.io/";
            const token = generateToken();
            await insertAccessToken({
                id: "oat_integ_res_slash_002",
                tokenHash: token.hash,
                scopes: ["read"],
                resource: "https://mcp.cynco.io",
            });

            expect(await resolveOAuthToken(token.raw)).not.toBeNull();
        });
    });
});

// ── API Key Tests ────────────────────────────────────────────────────

describe("Integration: API key resolution", () => {
    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await testQuery("DELETE FROM mcp_api_keys WHERE tenant_id = $1", [TEST_CLIENT_ID]);
        await cleanupTestData();
    });

    let resolveApiKey: typeof import("../../src/auth.js").resolveApiKey;

    beforeAll(async () => {
        const mod = await import("../../src/auth.js");
        resolveApiKey = mod.resolveApiKey;
    });

    it("resolves a valid active API key", async () => {
        const raw = `cak_${randomBytes(32).toString("base64url")}`;
        const hash = createHash("sha256").update(raw).digest("hex");
        await insertApiKey({
            id: "mak_integ_valid_001",
            keyHash: hash,
            scopes: ["read", "write"],
        });

        const result = await resolveApiKey(raw);

        expect(result).not.toBeNull();
        expect(result!.id).toBe("mak_integ_valid_001");
        expect(result!.tenantType).toBe("client");
        expect(result!.tenantId).toBe(TEST_CLIENT_ID);
        expect(result!.scopes).toEqual(["read", "write"]);
    });

    it("returns null for inactive key", async () => {
        const raw = `cak_${randomBytes(32).toString("base64url")}`;
        const hash = createHash("sha256").update(raw).digest("hex");
        await insertApiKey({
            id: "mak_integ_inactive_001",
            keyHash: hash,
            scopes: ["read"],
            isActive: false,
        });

        expect(await resolveApiKey(raw)).toBeNull();
    });

    it("returns null for expired key", async () => {
        const raw = `cak_${randomBytes(32).toString("base64url")}`;
        const hash = createHash("sha256").update(raw).digest("hex");
        await insertApiKey({
            id: "mak_integ_expired_001",
            keyHash: hash,
            scopes: ["read"],
            expiresAt: new Date(Date.now() - 1000),
        });

        expect(await resolveApiKey(raw)).toBeNull();
    });

    it("accepts key with no expiry (null expires_at)", async () => {
        const raw = `cak_${randomBytes(32).toString("base64url")}`;
        const hash = createHash("sha256").update(raw).digest("hex");
        await insertApiKey({
            id: "mak_integ_no_expiry_001",
            keyHash: hash,
            scopes: ["read"],
            expiresAt: null,
        });

        const result = await resolveApiKey(raw);
        expect(result).not.toBeNull();
    });

    it("returns null for completely unknown key", async () => {
        expect(await resolveApiKey("cak_does_not_exist_anywhere")).toBeNull();
    });
});
