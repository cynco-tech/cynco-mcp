import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test errorResponse by importing it and controlling NODE_ENV
// errorResponse reads process.env.NODE_ENV at module load time,
// so we test the isInternalError logic via the response content.

describe("errorResponse masking", () => {
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

  // ── Production: internal errors masked ──

  it("masks DB relation errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse('relation "users" does not exist', undefined, "req-123");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
    expect(text.error).toContain("req-123");
    expect(text.error).not.toContain("relation");
  });

  it("masks connection errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("connect ECONNREFUSED 127.0.0.1:5432", undefined, "req-456");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
    expect(text.error).not.toContain("ECONNREFUSED");
  });

  it("masks constraint violations in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("duplicate key value violates unique constraint");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
  });

  it("masks syntax errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse('syntax error at or near "SELECT"');
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Internal error");
  });

  // ── Production: user-facing errors pass through ──

  it("passes through validation errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("Exactly one of clientId or accountingFirmId must be provided (XOR).");
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Exactly one of clientId or accountingFirmId must be provided (XOR).");
  });

  it("passes through scope errors in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse('Insufficient permissions: this API key requires "write" scope.');
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("Insufficient permissions");
  });

  // ── Development: all errors pass through ──

  it("shows full DB errors in development", async () => {
    const errorResponse = await getErrorResponse("development");
    const result = errorResponse('relation "users" does not exist');
    const text = JSON.parse(result.content[0].text);
    expect(text.error).toContain("relation");
  });

  // ── Request ID inclusion ──

  it("includes requestId in response", async () => {
    const errorResponse = await getErrorResponse("development");
    const result = errorResponse("Some error", undefined, "req-789");
    const text = JSON.parse(result.content[0].text);
    expect(text.requestId).toBe("req-789");
  });

  it("excludes details in production", async () => {
    const errorResponse = await getErrorResponse("production");
    const result = errorResponse("Some validation error", { extra: "info" });
    const text = JSON.parse(result.content[0].text);
    expect(text.details).toBeUndefined();
  });

  it("includes details in development", async () => {
    const errorResponse = await getErrorResponse("development");
    const result = errorResponse("Some error", { extra: "info" });
    const text = JSON.parse(result.content[0].text);
    expect(text.details).toEqual({ extra: "info" });
  });
});
