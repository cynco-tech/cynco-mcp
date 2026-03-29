import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  calculateLineItems,
  buildUpdateSet,
  validateTransition,
  lineItemSchema,
  tenantSchema,
} from "../src/utils/tools.js";
import type { LineItem } from "../src/utils/tools.js";

// ─────────────────────────────────────────────────────────────────────────────
// calculateLineItems
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateLineItems", () => {
  it("calculates amount as quantity × unitPrice", () => {
    const result = calculateLineItems([
      { description: "Widget", quantity: 3, unitPrice: 10 },
    ]);
    expect(result.items[0].amount).toBe(30);
    expect(result.subtotal).toBe(30);
    expect(result.totalTax).toBe(0);
    expect(result.totalAmount).toBe(30);
  });

  it("calculates tax from taxRate percentage", () => {
    const result = calculateLineItems([
      { description: "Service", quantity: 1, unitPrice: 100, taxRate: 6 },
    ]);
    expect(result.items[0].amount).toBe(100);
    expect(result.items[0].taxAmount).toBe(6);
    expect(result.subtotal).toBe(100);
    expect(result.totalTax).toBe(6);
    expect(result.totalAmount).toBe(106);
  });

  it("sums multiple line items correctly", () => {
    const items: LineItem[] = [
      { description: "A", quantity: 2, unitPrice: 50, taxRate: 10 },
      { description: "B", quantity: 1, unitPrice: 200, taxRate: 6 },
    ];
    const result = calculateLineItems(items);
    // A: 100 + 10 tax = 110
    // B: 200 + 12 tax = 212
    expect(result.subtotal).toBe(300);
    expect(result.totalTax).toBe(22);
    expect(result.totalAmount).toBe(322);
  });

  it("handles zero quantity", () => {
    const result = calculateLineItems([
      { description: "Free", quantity: 0, unitPrice: 100 },
    ]);
    expect(result.items[0].amount).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it("handles zero unitPrice", () => {
    const result = calculateLineItems([
      { description: "Gratis", quantity: 5, unitPrice: 0 },
    ]);
    expect(result.totalAmount).toBe(0);
  });

  it("handles empty items array", () => {
    const result = calculateLineItems([]);
    expect(result.items).toHaveLength(0);
    expect(result.subtotal).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it("rounds amounts to 2 decimal places", () => {
    // 3 × 33.33 = 99.99 (not 99.990000...01)
    const result = calculateLineItems([
      { description: "Precise", quantity: 3, unitPrice: 33.33 },
    ]);
    expect(result.items[0].amount).toBe(99.99);
    expect(result.subtotal).toBe(99.99);
  });

  it("rounds tax to 2 decimal places", () => {
    // 100 × 7.7% = 7.7 (not 7.700000...01)
    const result = calculateLineItems([
      { description: "Tax test", quantity: 1, unitPrice: 100, taxRate: 7.7 },
    ]);
    expect(result.items[0].taxAmount).toBe(7.7);
  });

  // ── Edge cases ──

  it("treats undefined taxRate as 0%", () => {
    const result = calculateLineItems([
      { description: "No tax", quantity: 1, unitPrice: 50 },
    ]);
    expect(result.items[0].taxAmount).toBe(0);
    expect(result.totalTax).toBe(0);
  });

  it("handles fractional quantities", () => {
    const result = calculateLineItems([
      { description: "Hours", quantity: 1.5, unitPrice: 80 },
    ]);
    expect(result.items[0].amount).toBe(120);
  });

  it("handles very large amounts without precision loss", () => {
    const result = calculateLineItems([
      { description: "Big", quantity: 1, unitPrice: 999999.99, taxRate: 6 },
    ]);
    expect(result.subtotal).toBe(999999.99);
    expect(result.items[0].taxAmount).toBe(60000);
    expect(result.totalAmount).toBe(1059999.99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUpdateSet
// ─────────────────────────────────────────────────────────────────────────────

describe("buildUpdateSet", () => {
  it("adds fields with defined values", () => {
    const builder = buildUpdateSet(1);
    builder.add("name", "Alice");
    builder.add("email", "alice@example.com");
    expect(builder.fields).toEqual(["name = $1", "email = $2"]);
    expect(builder.values).toEqual(["Alice", "alice@example.com"]);
    expect(builder.paramIdx).toBe(3);
  });

  it("skips undefined values", () => {
    const builder = buildUpdateSet(1);
    builder.add("name", "Bob");
    builder.add("email", undefined);
    builder.add("phone", "123");
    expect(builder.fields).toEqual(["name = $1", "phone = $2"]);
    expect(builder.values).toEqual(["Bob", "123"]);
  });

  it("includes null values (null is a valid update)", () => {
    const builder = buildUpdateSet(1);
    builder.add("memo", null);
    expect(builder.fields).toEqual(["memo = $1"]);
    expect(builder.values).toEqual([null]);
  });

  it("includes false and 0 values", () => {
    const builder = buildUpdateSet(1);
    builder.add("is_active", false);
    builder.add("balance", 0);
    expect(builder.fields).toHaveLength(2);
    expect(builder.values).toEqual([false, 0]);
  });

  it("includes empty string values", () => {
    const builder = buildUpdateSet(1);
    builder.add("notes", "");
    expect(builder.fields).toHaveLength(1);
    expect(builder.values).toEqual([""]);
  });

  it("starts from custom param index", () => {
    const builder = buildUpdateSet(5);
    builder.add("name", "Test");
    expect(builder.fields).toEqual(["name = $5"]);
    expect(builder.paramIdx).toBe(6);
  });

  it("returns empty arrays when no fields added", () => {
    const builder = buildUpdateSet(1);
    builder.add("a", undefined);
    builder.add("b", undefined);
    expect(builder.fields).toHaveLength(0);
    expect(builder.values).toHaveLength(0);
    expect(builder.paramIdx).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateTransition
// ─────────────────────────────────────────────────────────────────────────────

describe("validateTransition", () => {
  const transitions: Record<string, string[]> = {
    draft: ["posted", "voided"],
    posted: ["approved", "voided"],
    approved: [],
    voided: [],
  };

  it("returns null for valid transition", () => {
    expect(validateTransition(transitions, "draft", "posted")).toBeNull();
    expect(validateTransition(transitions, "draft", "voided")).toBeNull();
    expect(validateTransition(transitions, "posted", "approved")).toBeNull();
  });

  it("returns error message for invalid transition", () => {
    const err = validateTransition(transitions, "draft", "approved");
    expect(err).toContain("Cannot transition");
    expect(err).toContain('"draft"');
    expect(err).toContain('"approved"');
    expect(err).toContain("posted, voided");
  });

  it("returns error with 'none' for terminal states", () => {
    const err = validateTransition(transitions, "voided", "draft");
    expect(err).toContain("Cannot transition");
    expect(err).toContain("none");
  });

  it("returns error for unknown current status", () => {
    const err = validateTransition(transitions, "unknown", "draft");
    expect(err).toContain("Cannot transition");
    expect(err).toContain("none");
  });

  // ── Edge cases ──

  it("rejects self-transition when not in allowed list", () => {
    const err = validateTransition(transitions, "draft", "draft");
    expect(err).not.toBeNull();
  });

  it("allows self-transition when explicitly in allowed list", () => {
    const custom = { active: ["active", "paused"] };
    expect(validateTransition(custom, "active", "active")).toBeNull();
  });

  it("handles empty transitions map", () => {
    const err = validateTransition({}, "draft", "posted");
    expect(err).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// lineItemSchema (Zod validation)
// ─────────────────────────────────────────────────────────────────────────────

describe("lineItemSchema", () => {
  it("accepts valid line item", () => {
    const result = lineItemSchema.safeParse({
      description: "Widget",
      quantity: 2,
      unitPrice: 10.5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts line item with optional tax fields", () => {
    const result = lineItemSchema.safeParse({
      description: "Service",
      quantity: 1,
      unitPrice: 100,
      taxRate: 6,
      taxCode: "SST-6",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative quantity", () => {
    const result = lineItemSchema.safeParse({
      description: "Bad",
      quantity: -1,
      unitPrice: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects Infinity unitPrice", () => {
    const result = lineItemSchema.safeParse({
      description: "Bad",
      quantity: 1,
      unitPrice: Infinity,
    });
    expect(result.success).toBe(false);
  });

  it("rejects NaN quantity", () => {
    const result = lineItemSchema.safeParse({
      description: "Bad",
      quantity: NaN,
      unitPrice: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const result = lineItemSchema.safeParse({
      quantity: 1,
      unitPrice: 10,
    });
    expect(result.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// tenantSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("tenantSchema", () => {
  it("has optional clientId and accountingFirmId", () => {
    const schema = z.object(tenantSchema);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ clientId: "client_abc" }).success).toBe(true);
    expect(schema.safeParse({ accountingFirmId: "accfirm_xyz" }).success).toBe(true);
  });
});
