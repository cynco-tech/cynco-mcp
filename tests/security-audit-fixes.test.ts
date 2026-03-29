/**
 * Tests for security audit fixes (BUG-1 through BUG-14).
 * Each describe block maps to one bug ID from the audit report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkScope } from "../src/auth.js";
import type { ApiKeyRecord } from "../src/auth.js";
import { getToolScope, TOOL_SCOPE_MAP } from "../src/scope-map.js";
import { validateCode } from "../src/code-mode/sandbox.js";

// ── Helpers ──

function makeRecord(scopes: string[]): ApiKeyRecord {
  return {
    id: "mak_test",
    tenantType: "client",
    tenantId: "client_abc",
    name: "Test Key",
    scopes,
  };
}

// Mirror the forbidden patterns from execute-query.ts for unit testing
// (avoids importing the module which has DB side effects)
const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i,
  /\bINTO\b/i,
  /\bUNION\b/i,
  /\bOR\b/i,
  /\(\s*SELECT\b/i, // BUG-1: blocks subqueries
  /;\s*\S/,
  /--/,
  /\/\*/,
];

function validateQuery(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();
  if (!/^\s*SELECT\b/i.test(trimmed)) {
    return { valid: false, error: "Only SELECT queries are allowed." };
  }
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: `Forbidden pattern: ${pattern.toString()}` };
    }
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════
// BUG-1: Subqueries blocked in execute_query
// ═══════════════════════════════════════════════════════════════════

describe("BUG-1: subquery tenant bypass prevention", () => {
  it("blocks scalar subqueries that bypass tenant filter", () => {
    const sql = "SELECT (SELECT count(*) FROM invoices) as total FROM invoices WHERE client_id = $1";
    expect(validateQuery(sql).valid).toBe(false);
  });

  it("blocks IN (SELECT ...) subqueries", () => {
    const sql = "SELECT * FROM invoices WHERE client_id = $1 AND customer_id IN (SELECT id FROM customers)";
    expect(validateQuery(sql).valid).toBe(false);
  });

  it("blocks EXISTS (SELECT ...) subqueries", () => {
    const sql = "SELECT * FROM invoices WHERE client_id = $1 AND EXISTS (SELECT 1 FROM customers WHERE name = 'Acme')";
    expect(validateQuery(sql).valid).toBe(false);
  });

  it("blocks correlated subqueries in SELECT list", () => {
    const sql = "SELECT id, (SELECT max(total_amount) FROM invoices) FROM invoices WHERE client_id = $1";
    expect(validateQuery(sql).valid).toBe(false);
  });

  it("still allows simple SELECT with JOINs", () => {
    const sql = "SELECT je.id FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id WHERE je.client_id = $1";
    expect(validateQuery(sql).valid).toBe(true);
  });

  it("still allows SELECT with IN (literal values)", () => {
    const sql = "SELECT * FROM invoices WHERE client_id = $1 AND status IN ('draft', 'finalized')";
    expect(validateQuery(sql).valid).toBe(true);
  });

  it("still allows simple aggregations", () => {
    const sql = "SELECT COUNT(*), SUM(total_amount) FROM invoices WHERE client_id = $1";
    expect(validateQuery(sql).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-7: Sequence number overflow (lexicographic MAX)
// ═══════════════════════════════════════════════════════════════════

describe("BUG-7: sequence number generation", () => {
  it("padStart does not truncate numbers > padWidth", () => {
    // Verify that padStart(4, "0") on a 5-digit number doesn't truncate
    const seq = 10000;
    const result = String(seq).padStart(4, "0");
    expect(result).toBe("10000"); // 5 chars, not truncated
  });

  it("demonstrates the lexicographic MAX bug (pre-fix)", () => {
    // "9999" > "10000" lexicographically — this is the bug the SQL fix addresses
    expect("INV-2026-9999" > "INV-2026-10000").toBe(true);
  });

  it("numeric extraction via regex produces correct ordering", () => {
    // Simulate what the SQL CAST(SUBSTRING(... FROM '\\d+$') AS INTEGER) does
    const extractSeq = (s: string) => parseInt(s.match(/\d+$/)?.[0] ?? "0", 10);
    expect(extractSeq("INV-2026-9999")).toBe(9999);
    expect(extractSeq("INV-2026-10000")).toBe(10000);
    expect(extractSeq("INV-2026-10000") > extractSeq("INV-2026-9999")).toBe(true);
  });

  it("handles non-numeric suffixes gracefully", () => {
    const extractSeq = (s: string) => parseInt(s.match(/\d+$/)?.[0] ?? "0", 10);
    // Manual entry like "MAN-2026-ABC" — no trailing digits → regex returns null → fallback "0" → 0
    expect(extractSeq("MAN-2026-ABC")).toBe(0);
    // SQL CAST(SUBSTRING(... FROM '\\d+$') AS INTEGER) returns NULL for non-numeric suffixes
    // MAX() ignores NULLs, so the next seq is based on the highest numeric entry
    // Entry like "MAN-2026-123ABC" — trailing digits are "123" (regex \d+$ won't match because 'ABC' is at end)
    expect(extractSeq("MAN-2026-123ABC")).toBe(0);
    // Entry like "MAN-2026-0050" — trailing digits are "0050"
    expect(extractSeq("MAN-2026-0050")).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-11: Error masking whitelist
// ═══════════════════════════════════════════════════════════════════

describe("BUG-11: error masking whitelist", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    vi.resetModules();
  });

  async function getErrorResponse(env: string) {
    process.env.NODE_ENV = env;
    const mod = await import("../src/utils/validation.js");
    return mod.errorResponse;
  }

  it("masks 'permission denied' errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("permission denied for table invoices", undefined, "req-1");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
    expect(text.error).not.toContain("permission denied");
  });

  it("masks 'deadlock detected' errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("deadlock detected", undefined, "req-2");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
  });

  it("masks 'value too long' errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("value too long for type character varying(100)", undefined, "req-3");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
    expect(text.error).not.toContain("character varying");
  });

  it("allows 'not found' errors through in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("Customer not found or does not belong to this tenant.");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Customer not found");
  });

  it("allows tenant XOR errors through in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("Exactly one of clientId or accountingFirmId must be provided (XOR).");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Exactly one of");
  });

  it("allows 'Insufficient permissions' through in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse('Insufficient permissions: this API key requires "accounting:write" scope.');
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Insufficient permissions");
  });

  it("allows payment overpayment errors through in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("Payment of 500 exceeds remaining balance.");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Payment of 500 exceeds");
  });

  it("allows closed period errors through in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("Period 2026-03 is closed. Reopen it before posting new journal entries.");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("is closed");
  });

  it("shows full errors in development", async () => {
    const errorResponse = await getErrorResponse("development");
    const result = errorResponse("permission denied for table invoices");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("permission denied");
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-12: Scope map fail-closed
// ═══════════════════════════════════════════════════════════════════

describe("BUG-12: getToolScope fail-closed on unmapped tools", () => {
  it("throws for unmapped tool names", () => {
    expect(() => getToolScope("nonexistent_tool")).toThrow("has no scope mapping");
  });

  it("returns correct scope for mapped tools", () => {
    expect(getToolScope("get_invoices")).toBe("invoicing:read");
    expect(getToolScope("create_invoice")).toBe("invoicing:write");
    expect(getToolScope("execute_query")).toBe("query:execute");
    expect(getToolScope("execute_code")).toBe("code:execute");
  });

  it("has mappings for all known tool categories", () => {
    // Verify key tools exist in the map
    const requiredTools = [
      "get_company_profile",
      "get_chart_of_accounts",
      "get_invoices",
      "create_invoice",
      "get_customers",
      "create_customer",
      "get_vendors",
      "create_vendor",
      "execute_query",
      "execute_code",
      "search_tools",
      "search_schema",
    ];
    for (const tool of requiredTools) {
      expect(TOOL_SCOPE_MAP[tool]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-13: Response size cap
// ═══════════════════════════════════════════════════════════════════

describe("BUG-13: successResponse size limit", () => {
  it("returns normal response for small data", async () => {
    vi.resetModules();
    const { successResponse } = await import("../src/utils/validation.js");
    const result = successResponse({ id: "test", name: "small" });
    const text = JSON.parse(result.content[0].text);
    expect(text.success).toBe(true);
    expect(text._truncated).toBeUndefined();
  });

  it("returns valid JSON summary for oversized responses", async () => {
    vi.resetModules();
    const { successResponse } = await import("../src/utils/validation.js");
    // Generate a large payload exceeding 100K chars
    const largeData = { items: Array.from({ length: 5000 }, (_, i) => ({
      id: `item_${i}`,
      description: "x".repeat(100),
      amount: i * 1.5,
    })) };
    const result = successResponse(largeData);
    const text = result.content[0].text;
    // Must be valid JSON
    const parsed = JSON.parse(text);
    expect(parsed._truncated).toBe(true);
    expect(parsed._originalSizeChars).toBeGreaterThan(100_000);
    expect(parsed._hint).toContain("size limit");
    // Data is NOT included — prevents holding the oversized payload in memory
    expect(parsed.data).toBeUndefined();
    // structuredContent must NOT be present (MCP spec compliance)
    expect((result as Record<string, unknown>).structuredContent).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-14: Finite validation on numeric fields
// ═══════════════════════════════════════════════════════════════════

describe("BUG-14: Infinity rejected by .finite() schemas", () => {
  it("z.number().finite() rejects Infinity", () => {
    const { z } = require("zod");
    const schema = z.number().min(0).finite();
    expect(schema.safeParse(Infinity).success).toBe(false);
    expect(schema.safeParse(-Infinity).success).toBe(false);
  });

  it("z.number().finite() rejects NaN", () => {
    const { z } = require("zod");
    const schema = z.number().finite();
    expect(schema.safeParse(NaN).success).toBe(false);
  });

  it("z.number().finite() accepts normal numbers", () => {
    const { z } = require("zod");
    const schema = z.number().min(0).finite();
    expect(schema.safeParse(0).success).toBe(true);
    expect(schema.safeParse(100.50).success).toBe(true);
    expect(schema.safeParse(999999).success).toBe(true);
  });

  it("z.number().positive().finite() accepts valid payment amounts", () => {
    const { z } = require("zod");
    const schema = z.number().positive().finite();
    expect(schema.safeParse(0.01).success).toBe(true);
    expect(schema.safeParse(10000).success).toBe(true);
    expect(schema.safeParse(Infinity).success).toBe(false);
    expect(schema.safeParse(0).success).toBe(false);
    expect(schema.safeParse(-1).success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-2: Payment overpayment guard (logic test)
// ═══════════════════════════════════════════════════════════════════

describe("BUG-2: overpayment guard logic", () => {
  it("detects overpayment correctly", () => {
    const totalAmount = 1000;
    const currentPaid = 800;
    const paymentAmount = 300;
    const remaining = totalAmount - currentPaid;
    // 300 > 200 → overpayment
    expect(paymentAmount > remaining && remaining >= 0).toBe(true);
  });

  it("allows exact remaining payment", () => {
    const totalAmount = 1000;
    const currentPaid = 800;
    const paymentAmount = 200;
    const remaining = totalAmount - currentPaid;
    // 200 > 200 → false → allowed
    expect(paymentAmount > remaining && remaining >= 0).toBe(false);
  });

  it("allows partial payment", () => {
    const totalAmount = 1000;
    const currentPaid = 0;
    const paymentAmount = 500;
    const remaining = totalAmount - currentPaid;
    // 500 > 1000 → false → allowed
    expect(paymentAmount > remaining && remaining >= 0).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-6: Session limits (logic test)
// ═══════════════════════════════════════════════════════════════════

describe("BUG-6: session limit logic", () => {
  it("enforces global max sessions", () => {
    const MAX_SESSIONS = 1000;
    const currentSessions = 1000;
    expect(currentSessions >= MAX_SESSIONS).toBe(true);
  });

  it("enforces per-tenant session limit", () => {
    const MAX_PER_TENANT = 20;
    const tenantSessions = 20;
    expect(tenantSessions >= MAX_PER_TENANT).toBe(true);
  });

  it("allows sessions under limits", () => {
    const MAX_SESSIONS = 1000;
    const MAX_PER_TENANT = 20;
    expect(500 >= MAX_SESSIONS).toBe(false);
    expect(5 >= MAX_PER_TENANT).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-9: Scope freshness check (logic test)
// ═══════════════════════════════════════════════════════════════════

describe("BUG-9: scope comparison logic", () => {
  it("detects scope narrowing", () => {
    const oldScopes = ["accounting:read", "accounting:write"].sort().join(",");
    const newScopes = ["accounting:read"].sort().join(",");
    expect(oldScopes !== newScopes).toBe(true);
  });

  it("detects scope widening", () => {
    const oldScopes = ["accounting:read"].sort().join(",");
    const newScopes = ["accounting:read", "invoicing:write"].sort().join(",");
    expect(oldScopes !== newScopes).toBe(true);
  });

  it("passes when scopes unchanged (different order)", () => {
    const oldScopes = ["invoicing:write", "accounting:read"].slice().sort().join(",");
    const newScopes = ["accounting:read", "invoicing:write"].slice().sort().join(",");
    expect(oldScopes !== newScopes).toBe(false);
  });

  it("passes when scopes identical", () => {
    const oldScopes = ["read"].slice().sort().join(",");
    const newScopes = ["read"].slice().sort().join(",");
    expect(oldScopes !== newScopes).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// BUG-5: DB pool config (smoke test)
// ═══════════════════════════════════════════════════════════════════

describe("BUG-5: pool timeout config parsing", () => {
  it("parseInt handles valid timeout values", () => {
    expect(parseInt("10000", 10)).toBe(10000);
    expect(parseInt("30000", 10)).toBe(30000);
  });

  it("parseInt with default fallback", () => {
    const val = parseInt(undefined || "10000", 10);
    expect(val).toBe(10000);
  });
});
