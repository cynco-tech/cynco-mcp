import { describe, it, expect, vi, afterEach } from "vitest";

describe("structuredContent and audience annotations", () => {
  afterEach(() => {
    vi.resetModules();
  });

  async function getValidation() {
    // Import fresh to avoid module caching issues
    return await import("../src/utils/validation.js");
  }

  it("successResponse includes both content and structuredContent", async () => {
    const { successResponse } = await getValidation();
    const result = successResponse({ customers: [], count: 0 });

    // content array exists with text
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");

    // structuredContent is the raw object
    const sc = (result as Record<string, unknown>).structuredContent as Record<string, unknown>;
    expect(sc).toBeDefined();
    expect(sc.success).toBe(true);
    expect(sc.data).toEqual({ customers: [], count: 0 });
  });

  it("successResponse text content is parseable JSON matching structuredContent", async () => {
    const { successResponse } = await getValidation();
    const data = { id: "test_123", name: "Test" };
    const result = successResponse(data);

    const parsed = JSON.parse(result.content[0].text);
    const sc = (result as Record<string, unknown>).structuredContent;
    expect(parsed).toEqual(sc);
  });

  it("successResponse has audience ['user', 'assistant']", async () => {
    const { successResponse } = await getValidation();
    const result = successResponse({ value: 42 });

    const annotations = (result.content[0] as Record<string, unknown>).annotations as Record<string, unknown>;
    expect(annotations).toBeDefined();
    expect(annotations.audience).toEqual(["user", "assistant"]);
  });

  it("errorResponse includes structuredContent", async () => {
    const { errorResponse } = await getValidation();
    const result = errorResponse("Something went wrong");

    const sc = (result as Record<string, unknown>).structuredContent as Record<string, unknown>;
    expect(sc).toBeDefined();
    expect(sc.success).toBe(false);
    expect(typeof sc.error).toBe("string");
  });

  it("errorResponse has audience ['assistant']", async () => {
    const { errorResponse } = await getValidation();
    const result = errorResponse("Error message");

    const annotations = (result.content[0] as Record<string, unknown>).annotations as Record<string, unknown>;
    expect(annotations).toBeDefined();
    expect(annotations.audience).toEqual(["assistant"]);
  });

  it("errorResponse has isError=true", async () => {
    const { errorResponse } = await getValidation();
    const result = errorResponse("Oops");
    expect(result.isError).toBe(true);
  });

  it("successResponse does NOT have isError", async () => {
    const { successResponse } = await getValidation();
    const result = successResponse({ ok: true });
    expect(result.isError).toBeUndefined();
  });
});
