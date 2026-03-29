import { describe, it, expect } from "vitest";
import { generateId } from "../src/utils/typeid.js";

describe("generateId", () => {
  it("produces an ID with the given prefix", () => {
    expect(generateId("je")).toMatch(/^je_/);
    expect(generateId("inv")).toMatch(/^inv_/);
    expect(generateId("cust")).toMatch(/^cust_/);
    expect(generateId("mak")).toMatch(/^mak_/);
  });

  it("produces unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId("test")));
    expect(ids.size).toBe(100);
  });

  it("produces a string (not undefined or null)", () => {
    const id = generateId("x");
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(3);
  });

  // ── Edge cases ──

  it("handles single-char prefix", () => {
    expect(generateId("x")).toMatch(/^x_/);
  });

  it("handles long prefix", () => {
    expect(generateId("longprefix")).toMatch(/^longprefix_/);
  });

  it("ID suffix is URL-safe (no +, /, =)", () => {
    // Generate many to increase confidence
    for (let i = 0; i < 50; i++) {
      const id = generateId("test");
      const suffix = id.slice(5); // after "test_"
      expect(suffix).not.toMatch(/[+/=]/);
    }
  });
});
