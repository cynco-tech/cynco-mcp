import { describe, it, expect } from "vitest";
import { executeSandbox, validateCode } from "../src/code-mode/sandbox.js";
import type { SandboxToolHandler } from "../src/code-mode/sandbox.js";

function mockHandlers(overrides: Record<string, SandboxToolHandler> = {}): Map<string, SandboxToolHandler> {
  const handlers = new Map<string, SandboxToolHandler>();

  // Default mock tool
  handlers.set("get_profile", async () => ({
    success: true,
    data: { companyName: "Test Corp" },
  }));

  handlers.set("get_invoices", async (args) => ({
    success: true,
    data: { invoices: [{ id: "inv_1", status: args.status || "draft" }] },
  }));

  handlers.set("slow_tool", async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { success: true, data: "done" };
  });

  handlers.set("failing_tool", async () => {
    throw new Error("DB connection failed");
  });

  for (const [name, handler] of Object.entries(overrides)) {
    handlers.set(name, handler);
  }

  return handlers;
}

describe("executeSandbox", () => {
  // ── Basic execution ──

  it("captures console.log output", async () => {
    const result = await executeSandbox(
      'console.log("hello world");',
      mockHandlers(),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("hello world");
    expect(result.toolCalls).toBe(0);
  });

  it("captures multiple console.log calls", async () => {
    const result = await executeSandbox(
      'console.log("line 1");\nconsole.log("line 2");',
      mockHandlers(),
    );
    expect(result.output).toBe("line 1\nline 2");
  });

  it("captures return value", async () => {
    const result = await executeSandbox(
      'return 42;',
      mockHandlers(),
    );
    expect(result.returnValue).toBe(42);
  });

  it("serializes objects in console.log", async () => {
    const result = await executeSandbox(
      'console.log({ key: "value" });',
      mockHandlers(),
    );
    expect(result.output).toContain('"key"');
    expect(result.output).toContain('"value"');
  });

  // ── Tool calls ──

  it("calls a mock tool and returns data", async () => {
    const result = await executeSandbox(
      `const r = await cynco.get_profile({});
       console.log(r.data.companyName);`,
      mockHandlers(),
    );
    expect(result.error).toBeUndefined();
    expect(result.output).toBe("Test Corp");
    expect(result.toolCalls).toBe(1);
  });

  it("passes args to tool handlers", async () => {
    const result = await executeSandbox(
      `const r = await cynco.get_invoices({ status: "paid" });
       console.log(r.data.invoices[0].status);`,
      mockHandlers(),
    );
    expect(result.output).toBe("paid");
  });

  it("handles multiple sequential tool calls", async () => {
    const result = await executeSandbox(
      `const p = await cynco.get_profile({});
       const i = await cynco.get_invoices({});
       console.log(p.data.companyName, i.data.invoices.length);`,
      mockHandlers(),
    );
    expect(result.toolCalls).toBe(2);
    expect(result.output).toBe("Test Corp 1");
  });

  // ── Error handling ──

  it("returns clear error for unknown tool", async () => {
    const result = await executeSandbox(
      `const r = await cynco.nonexistent_tool({});
       console.log(r.error);`,
      mockHandlers(),
    );
    expect(result.output).toContain("Unknown tool: nonexistent_tool");
  });

  it("catches tool handler errors", async () => {
    const result = await executeSandbox(
      `const r = await cynco.failing_tool({});
       console.log(r.success, r.error);`,
      mockHandlers(),
    );
    expect(result.output).toContain("false");
    expect(result.output).toContain("DB connection failed");
  });

  it("reports syntax errors", async () => {
    const result = await executeSandbox(
      'const x = {;',
      mockHandlers(),
    );
    expect(result.error).toBeTruthy();
  });

  // ── Security ──

  it("does not expose process", async () => {
    const result = await executeSandbox(
      'try { console.log(typeof process); } catch(e) { console.log("blocked: " + e.message); }',
      mockHandlers(),
    );
    // process should either be undefined or throw
    expect(result.output).toMatch(/undefined|blocked/);
  });

  it("does not expose require", async () => {
    const result = await executeSandbox(
      'try { require("fs"); } catch(e) { console.log("blocked"); }',
      mockHandlers(),
    );
    expect(result.output).toContain("blocked");
  });

  it("prevents code generation from strings", async () => {
    // codeGeneration: { strings: false } should prevent eval-like tricks
    const result = await executeSandbox(
      'try { const f = new Function("return 1"); } catch(e) { console.log("blocked"); }',
      mockHandlers(),
    );
    expect(result.output).toContain("blocked");
  });

  // ── Limits ──

  it("truncates output at MAX_OUTPUT_CHARS", async () => {
    const result = await executeSandbox(
      'for (let i = 0; i < 10000; i++) console.log("x".repeat(100));',
      mockHandlers(),
    );
    // Output should be capped (50KB = 50000 chars)
    expect(result.output.length).toBeLessThanOrEqual(51000); // Some slack for truncation marker
    expect(result.output).toContain("[truncated]");
  });

  it("rejects scripts exceeding MAX_SCRIPT_LENGTH", async () => {
    const longCode = "// " + "x".repeat(11000);
    const result = await executeSandbox(longCode, mockHandlers());
    expect(result.error).toContain("Script too long");
  });

  it("enforces max tool calls limit", async () => {
    let callCount = 0;
    const handlers = mockHandlers({
      counter: async () => {
        callCount++;
        return { success: true, data: callCount };
      },
    });

    const result = await executeSandbox(
      `for (let i = 0; i < 55; i++) {
         const r = await cynco.counter({});
         if (!r.success) { console.log("limit hit at " + i); break; }
       }`,
      handlers,
    );
    expect(result.output).toContain("limit hit at 50");
    expect(result.toolCalls).toBe(51); // 50 successful + 1 that hits the limit
  });

  it("tracks durationMs", async () => {
    const result = await executeSandbox('console.log("fast");', mockHandlers());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeLessThan(5000);
  });
});

describe("validateCode", () => {
  it("returns null for valid code", () => {
    expect(validateCode('const x = await cynco.get_profile({});')).toBeNull();
  });

  it("blocks process property access", () => {
    expect(validateCode('process.exit(1)')).toContain("process");
  });

  it("allows 'process' as a variable name", () => {
    expect(validateCode('const processItems = items.filter(i => i.processed);')).toBeNull();
  });

  it("blocks require()", () => {
    expect(validateCode('const fs = require("fs")')).toContain("require");
  });

  it("blocks import()", () => {
    expect(validateCode('const m = await import("fs")')).toContain("import");
  });

  it("blocks eval()", () => {
    expect(validateCode('eval("alert(1)")')).toContain("eval");
  });

  it("blocks Function()", () => {
    expect(validateCode('new Function("return 1")()')).toContain("Function");
  });
});
