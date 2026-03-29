import { describe, it, expect, vi, afterEach } from "vitest";

describe("successResponse truncation", () => {
  afterEach(() => {
    vi.resetModules();
  });

  async function getValidation() {
    return await import("../src/utils/validation.js");
  }

  it("returns full data when under 100K chars", async () => {
    const { successResponse } = await getValidation();
    const data = { items: Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Item ${i}` })) };
    const result = successResponse(data);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed._truncated).toBeUndefined();
    expect(parsed.data.items).toHaveLength(10);
  });

  it("truncates response over 100K chars with valid JSON summary", async () => {
    const { successResponse } = await getValidation();
    // Generate a payload that exceeds 100K chars
    const bigData = { rows: Array.from({ length: 5000 }, (_, i) => ({
      id: `row_${i}`,
      description: "x".repeat(20),
      amount: "999999.99",
    })) };
    const result = successResponse(bigData);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.success).toBe(true);
    expect(parsed._truncated).toBe(true);
    expect(parsed._originalSizeChars).toBeGreaterThan(100_000);
    expect(parsed._hint).toContain("size limit");
    // Must NOT contain the actual data (that's the point of truncation)
    expect(parsed.data).toBeUndefined();
  });

  it("truncated response has no structuredContent (MCP spec compliance)", async () => {
    const { successResponse } = await getValidation();
    const bigData = { rows: Array.from({ length: 5000 }, (_, i) => ({
      id: `row_${i}`, payload: "x".repeat(20),
    })) };
    const result = successResponse(bigData);
    const sc = (result as Record<string, unknown>).structuredContent;
    expect(sc).toBeUndefined();
  });
});
