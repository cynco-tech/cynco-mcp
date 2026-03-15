import { describe, it, expect } from "vitest";
import { hashApiKey, generateApiKey, extractBearerToken, apiKeyToTenant } from "../src/auth.js";
import type { ApiKeyRecord } from "../src/auth.js";

describe("hashApiKey", () => {
  it("produces consistent SHA-256 hex", () => {
    const hash1 = hashApiKey("cak_test_key_123");
    const hash2 = hashApiKey("cak_test_key_123");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("different keys produce different hashes", () => {
    const hash1 = hashApiKey("cak_key_a");
    const hash2 = hashApiKey("cak_key_b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("generateApiKey", () => {
  it("generates key with cak_ prefix", () => {
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    expect(rawKey).toMatch(/^cak_/);
    expect(keyHash).toHaveLength(64);
    expect(keyPrefix).toMatch(/^cak_.*\.\.\.$/);
  });

  it("generates unique keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it("hash matches re-hashing the raw key", () => {
    const { rawKey, keyHash } = generateApiKey();
    expect(hashApiKey(rawKey)).toBe(keyHash);
  });
});

describe("extractBearerToken", () => {
  it("extracts token from valid header", () => {
    expect(extractBearerToken("Bearer cak_abc123")).toBe("cak_abc123");
  });

  it("handles case insensitive Bearer", () => {
    expect(extractBearerToken("bearer cak_abc123")).toBe("cak_abc123");
  });

  it("returns null for missing header", () => {
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractBearerToken("")).toBeNull();
  });

  it("returns null for Bearer with no token", () => {
    expect(extractBearerToken("Bearer ")).toBeNull();
  });
});

describe("apiKeyToTenant", () => {
  it("converts client record", () => {
    const record: ApiKeyRecord = {
      id: "mak_test",
      tenantType: "client",
      tenantId: "client_abc",
      name: "Test",
      scopes: [],
    };
    const tenant = apiKeyToTenant(record);
    expect(tenant.column).toBe("client_id");
    expect(tenant.value).toBe("client_abc");
    expect(tenant.clientId).toBe("client_abc");
    expect(tenant.accountingFirmId).toBeNull();
  });

  it("converts accounting firm record", () => {
    const record: ApiKeyRecord = {
      id: "mak_test",
      tenantType: "accounting_firm",
      tenantId: "accfirm_xyz",
      name: "Test",
      scopes: [],
    };
    const tenant = apiKeyToTenant(record);
    expect(tenant.column).toBe("accounting_firm_id");
    expect(tenant.value).toBe("accfirm_xyz");
    expect(tenant.clientId).toBeNull();
    expect(tenant.accountingFirmId).toBe("accfirm_xyz");
  });
});
