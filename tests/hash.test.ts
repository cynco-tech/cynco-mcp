import { describe, it, expect } from "vitest";
import { computeTransactionHash } from "../src/utils/hash.js";

describe("computeTransactionHash", () => {
  const base = {
    accountId: "fac_abc123",
    date: "2026-01-15",
    type: "debit",
    amount: "150.00",
    description: "GRAB FOOD",
  };

  it("produces a 64-char hex SHA-256 hash", () => {
    const hash = computeTransactionHash(
      base.accountId, base.date, base.type, base.amount, base.description,
    );
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same inputs produce same hash", () => {
    const h1 = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description);
    const h2 = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description);
    expect(h1).toBe(h2);
  });

  it("changes when any field changes", () => {
    const original = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description);

    // Different account
    expect(computeTransactionHash("fac_other", base.date, base.type, base.amount, base.description)).not.toBe(original);
    // Different date
    expect(computeTransactionHash(base.accountId, "2026-01-16", base.type, base.amount, base.description)).not.toBe(original);
    // Different type
    expect(computeTransactionHash(base.accountId, base.date, "credit", base.amount, base.description)).not.toBe(original);
    // Different amount
    expect(computeTransactionHash(base.accountId, base.date, base.type, "150.01", base.description)).not.toBe(original);
    // Different description
    expect(computeTransactionHash(base.accountId, base.date, base.type, base.amount, "GRAB CAR")).not.toBe(original);
  });

  it("includes optional reference in hash when provided", () => {
    const withoutRef = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description);
    const withRef = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description, "REF-001");
    expect(withoutRef).not.toBe(withRef);
  });

  it("treats missing reference as empty string", () => {
    const noRef = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description);
    const emptyRef = computeTransactionHash(base.accountId, base.date, base.type, base.amount, base.description, "");
    expect(noRef).toBe(emptyRef);
  });

  // ── Edge cases ──

  it("handles empty description", () => {
    const hash = computeTransactionHash(base.accountId, base.date, base.type, base.amount, "");
    expect(hash).toHaveLength(64);
  });

  it("KNOWN LIMITATION: pipe in field values can cause collision across field boundaries", () => {
    // This test documents a real limitation: since "|" is the separator,
    // a pipe character IN a field value can shift field boundaries.
    // hash("a","b","c","d","e|f") == hash("a","b","c","d|e","f")
    // because both produce the same joined string: "a|b|c|d|e|f"
    //
    // This is acceptable because:
    // 1. Bank transaction descriptions rarely contain literal "|"
    // 2. The format must match remix/app/services/bankingParsers.server.ts exactly
    // 3. Changing the separator would break dedup for existing transactions
    const h1 = computeTransactionHash("a", "b", "c", "d", "e|f");
    const h2 = computeTransactionHash("a", "b", "c", "d|e", "f");
    // These DO collide — this is the known limitation
    expect(h1).toBe(h2);
  });

  it("pipe within same field position does NOT cause collision", () => {
    // Pipes within the SAME field are fine — only cross-boundary is the issue
    const h1 = computeTransactionHash("fac_x", "2026-01-01", "debit", "100", "GRAB|FOOD");
    const h2 = computeTransactionHash("fac_x", "2026-01-01", "debit", "100", "GRAB FOOD");
    expect(h1).not.toBe(h2);
  });

  it("handles unicode in description", () => {
    const hash = computeTransactionHash(base.accountId, base.date, base.type, base.amount, "支付宝转账 RM50");
    expect(hash).toHaveLength(64);
  });
});
