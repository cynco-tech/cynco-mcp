import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  zodToTypeScript,
  generateToolDeclaration,
  generateDeclarationsBlock,
} from "../src/code-mode/type-generator.js";

describe("zodToTypeScript (extended)", () => {
  // Existing tests cover primitives. These cover complex/edge cases.

  it("converts z.literal string", () => {
    expect(zodToTypeScript(z.literal("draft"))).toBe('"draft"');
  });

  it("converts z.literal number", () => {
    expect(zodToTypeScript(z.literal(42))).toBe("42");
  });

  it("converts z.enum to union", () => {
    const result = zodToTypeScript(z.enum(["draft", "posted", "voided"]));
    expect(result).toBe('"draft" | "posted" | "voided"');
  });

  it("converts z.array of primitives", () => {
    expect(zodToTypeScript(z.array(z.string()))).toBe("string[]");
  });

  it("converts z.array of union (wraps in parens)", () => {
    const result = zodToTypeScript(z.array(z.union([z.string(), z.number()])));
    expect(result).toBe("(string | number)[]");
  });

  it("converts z.object to inline type", () => {
    const result = zodToTypeScript(z.object({ name: z.string(), age: z.number() }));
    expect(result).toContain("name: string");
    expect(result).toContain("age: number");
  });

  it("marks optional fields with ?", () => {
    const result = zodToTypeScript(z.object({ name: z.string(), memo: z.string().optional() }));
    expect(result).toContain("name: string");
    expect(result).toContain("memo?: string");
  });

  it("converts z.nullable", () => {
    expect(zodToTypeScript(z.string().nullable())).toBe("string | null");
  });

  it("converts z.record", () => {
    expect(zodToTypeScript(z.record(z.number()))).toBe("Record<string, number>");
  });

  it("converts z.union", () => {
    const result = zodToTypeScript(z.union([z.string(), z.number(), z.boolean()]));
    expect(result).toBe("string | number | boolean");
  });

  it("converts z.default (unwraps to inner type)", () => {
    expect(zodToTypeScript(z.number().default(50))).toBe("number");
  });

  it("converts z.void", () => {
    expect(zodToTypeScript(z.void())).toBe("void");
  });

  it("converts z.never", () => {
    expect(zodToTypeScript(z.never())).toBe("never");
  });

  it("converts z.unknown", () => {
    expect(zodToTypeScript(z.unknown())).toBe("unknown");
  });

  it("converts z.any to unknown (safe)", () => {
    expect(zodToTypeScript(z.any())).toBe("unknown");
  });

  it("handles deeply nested objects", () => {
    const schema = z.object({
      address: z.object({
        city: z.string(),
        zip: z.string(),
      }),
    });
    const result = zodToTypeScript(schema);
    expect(result).toContain("address: { city: string; zip: string }");
  });

  it("includes description as JSDoc comment in object fields", () => {
    const schema = z.object({
      limit: z.number().describe("Max results"),
    });
    const result = zodToTypeScript(schema);
    expect(result).toContain("/** Max results */");
  });

  it("returns 'unknown' for excessive depth", () => {
    // Build a 15-level deep nested optional chain
    let schema: z.ZodTypeAny = z.string();
    for (let i = 0; i < 15; i++) {
      schema = z.object({ nested: schema });
    }
    const result = zodToTypeScript(schema);
    expect(result).toContain("unknown");
  });
});

describe("generateToolDeclaration", () => {
  it("produces a function declaration with JSDoc", () => {
    const result = generateToolDeclaration(
      "get_invoices",
      "List invoices with filters.",
      { status: z.string().optional(), limit: z.number().default(50) },
    );
    expect(result).toContain("/** List invoices with filters. */");
    expect(result).toContain("function get_invoices(args:");
    expect(result).toContain("status?: string");
    expect(result).toContain("limit?: number");
    expect(result).toContain("): Promise<ToolResult>;");
  });

  it("escapes */ in description to prevent JSDoc breakout", () => {
    const result = generateToolDeclaration(
      "test_tool",
      "Description with */ injection",
      { id: z.string() },
    );
    // The */ inside the description should be escaped to "* /"
    // so it doesn't prematurely close the JSDoc comment
    expect(result).toContain("Description with * / injection");
    expect(result).not.toContain("Description with */");
  });
});

describe("generateDeclarationsBlock", () => {
  it("produces a namespace with ToolResult interface", () => {
    const result = generateDeclarationsBlock([
      {
        name: "get_customers",
        description: "List customers.",
        inputSchema: { limit: z.number().optional() },
      },
    ]);
    expect(result).toContain("interface ToolResult");
    expect(result).toContain("declare namespace cynco");
    expect(result).toContain("function get_customers");
    expect(result).toContain("}");
  });

  it("includes multiple tools", () => {
    const result = generateDeclarationsBlock([
      { name: "tool_a", description: "A", inputSchema: {} },
      { name: "tool_b", description: "B", inputSchema: { x: z.string() } },
    ]);
    expect(result).toContain("function tool_a");
    expect(result).toContain("function tool_b");
  });

  it("handles empty tool list", () => {
    const result = generateDeclarationsBlock([]);
    expect(result).toContain("declare namespace cynco");
    expect(result).toContain("}");
  });
});
