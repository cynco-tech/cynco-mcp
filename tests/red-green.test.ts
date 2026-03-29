/**
 * RED-GREEN TESTS
 *
 * These tests are designed to FAIL first (red) against a buggy implementation,
 * then PASS (green) against the correct implementation — proving the tests
 * actually detect real bugs and aren't just rubber-stamping working code.
 *
 * Each test documents:
 *   - The bug it catches
 *   - Why the naive/buggy implementation fails
 *   - The fix that makes it pass
 */
import { describe, it, expect } from "vitest";
import { calculateLineItems } from "../src/utils/tools.js";
import { computeTransactionHash } from "../src/utils/hash.js";

// ─────────────────────────────────────────────────────────────────────────────
// RED-GREEN #1: Floating point rounding in line item calculations
//
// BUG: A naive implementation using raw floating point arithmetic would produce:
//   0.1 + 0.2 = 0.30000000000000004
//   19.99 * 3 = 59.970000000000006
//
// The correct implementation uses toFixed(2) + parseFloat to round to 2 decimals.
//
// RED phase: If calculateLineItems used raw `quantity * unitPrice` without rounding,
//   this test would fail because 19.99 * 3 !== 59.97 in IEEE 754.
// GREEN phase: The actual implementation rounds with toFixed(2), so it passes.
// ─────────────────────────────────────────────────────────────────────────────

describe("RED-GREEN #1: floating point rounding in calculateLineItems", () => {
  it("produces exact 2-decimal amounts, not IEEE 754 artifacts", () => {
    // 19.99 * 3 = 59.97 (not 59.970000000000006)
    const result = calculateLineItems([
      { description: "Widget", quantity: 3, unitPrice: 19.99 },
    ]);
    expect(result.items[0].amount).toBe(59.97);
    expect(result.subtotal).toBe(59.97);

    // Verify it's exactly 59.97, not a float approximation
    expect(result.items[0].amount.toString()).toBe("59.97");
  });

  it("rounds tax correctly for problematic percentages", () => {
    // 33.33 * 7% = 2.3331 → should round to 2.33, not 2.3331
    const result = calculateLineItems([
      { description: "Tax edge", quantity: 1, unitPrice: 33.33, taxRate: 7 },
    ]);
    expect(result.items[0].taxAmount).toBe(2.33);
    expect(result.items[0].taxAmount.toString()).toBe("2.33");
  });

  it("totalAmount is independently rounded (not raw subtotal + totalTax)", () => {
    // Multiple items where naive addition would accumulate float errors
    const result = calculateLineItems([
      { description: "A", quantity: 1, unitPrice: 0.1, taxRate: 10 },
      { description: "B", quantity: 1, unitPrice: 0.2, taxRate: 10 },
      { description: "C", quantity: 1, unitPrice: 0.3, taxRate: 10 },
    ]);
    // Naive: 0.1 + 0.2 + 0.3 = 0.6000000000000001
    // Correct: 0.6 (rounded)
    expect(result.subtotal).toBe(0.6);
    // totalAmount is parseFloat((subtotal + totalTax).toFixed(2)) — independently rounded
    // NOT the raw JS expression subtotal + totalTax (which would be 0.6599999999999999)
    expect(result.totalAmount).toBe(0.66);
    expect(result.totalAmount.toString()).toBe("0.66");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RED-GREEN #2: Transaction hash field ordering matters for dedup
//
// BUG: If computeTransactionHash joined fields without a separator, or used
//   a separator that could appear in field values, different transactions
//   could produce the same hash (collision), causing silent data loss during
//   bank transaction import dedup.
//
// Example collision without separator:
//   hash("abc", "def") === hash("ab", "cdef") because "abcdef" === "abcdef"
//
// RED phase: A naive implementation using fields.join("") would fail this test.
// GREEN phase: The actual implementation uses "|" as separator, preventing collision.
// ─────────────────────────────────────────────────────────────────────────────

describe("RED-GREEN #2: transaction hash collision resistance", () => {
  it("different field boundaries produce different hashes (separator prevents collision)", () => {
    // Without a separator: "abc" + "def" = "abcdef" = "ab" + "cdef"
    // With "|" separator: "abc|def" ≠ "ab|cdef"
    const h1 = computeTransactionHash("fac_abc", "2026-01", "debit", "100", "PAYMENT");
    const h2 = computeTransactionHash("fac_ab", "c2026-01", "debit", "100", "PAYMENT");
    expect(h1).not.toBe(h2);
  });

  it("amount precision matters — '100' and '100.00' produce different hashes", () => {
    // This catches a real bug: if the Remix parser sends "100.00" but the MCP
    // server sends "100", the dedup would fail to match and create duplicates.
    // The hash function must receive the EXACT same string representation.
    const h1 = computeTransactionHash("fac_x", "2026-01-01", "debit", "100", "desc");
    const h2 = computeTransactionHash("fac_x", "2026-01-01", "debit", "100.00", "desc");
    expect(h1).not.toBe(h2);
  });

  it("empty reference vs no reference produce the same hash (both normalize to empty)", () => {
    // This is the CORRECT behavior — undefined reference should equal empty string.
    // A buggy implementation that used `undefined` literally would break dedup
    // between the Remix parser (which sends "") and MCP (which might send undefined).
    const h1 = computeTransactionHash("fac_x", "2026-01-01", "debit", "100", "desc", undefined);
    const h2 = computeTransactionHash("fac_x", "2026-01-01", "debit", "100", "desc", "");
    expect(h1).toBe(h2);
  });

  it("whitespace in description is significant (not trimmed)", () => {
    // Bank statements often have trailing spaces. If we trimmed, we'd get
    // false dedup matches between "GRAB FOOD" and "GRAB FOOD  ".
    const h1 = computeTransactionHash("fac_x", "2026-01-01", "debit", "50", "GRAB FOOD");
    const h2 = computeTransactionHash("fac_x", "2026-01-01", "debit", "50", "GRAB FOOD  ");
    expect(h1).not.toBe(h2);
  });
});
