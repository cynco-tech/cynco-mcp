import { describe, it, expect, vi, afterEach } from "vitest";

describe("MCP spec-compliant tool responses", () => {
  afterEach(() => {
    vi.resetModules();
  });

  async function getValidation() {
    // Import fresh to avoid module caching issues
    return await import("../src/utils/validation.js");
  }

  it("successResponse returns content array with text (no structuredContent per MCP spec)", async () => {
    const { successResponse } = await getValidation();
    const result = successResponse({ customers: [], count: 0 });

    // content array exists with text
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");

    // structuredContent must NOT be present (not in MCP spec CallToolResult)
    const sc = (result as Record<string, unknown>).structuredContent;
    expect(sc).toBeUndefined();
  });

  it("successResponse text content is parseable JSON with success and data", async () => {
    const { successResponse } = await getValidation();
    const data = { id: "test_123", name: "Test" };
    const result = successResponse(data);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(data);
  });

  it("successResponse has audience ['user', 'assistant']", async () => {
    const { successResponse } = await getValidation();
    const result = successResponse({ value: 42 });

    const annotations = (result.content[0] as Record<string, unknown>).annotations as Record<string, unknown>;
    expect(annotations).toBeDefined();
    expect(annotations.audience).toEqual(["user", "assistant"]);
  });

  it("errorResponse does NOT include structuredContent (MCP spec compliance)", async () => {
    const { errorResponse } = await getValidation();
    const result = errorResponse("Something went wrong");

    const sc = (result as Record<string, unknown>).structuredContent;
    expect(sc).toBeUndefined();

    // Error should still be in the text content
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe("string");
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
