import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  zodToTypeScript,
  generateToolDeclaration,
  generateDeclarationsBlock,
} from "../src/code-mode/type-generator.js";

describe("zodToTypeScript", () => {
  // ── Primitives ──

  it("converts string", () => {
    expect(zodToTypeScript(z.string())).toBe("string");
  });

  it("converts number", () => {
    expect(zodToTypeScript(z.number())).toBe("number");
  });

  it("converts boolean", () => {
    expect(zodToTypeScript(z.boolean())).toBe("boolean");
  });

  it("converts null", () => {
    expect(zodToTypeScript(z.null())).toBe("null");
  });

  // ── Enums ──

  it("converts enum to string union", () => {
    expect(zodToTypeScript(z.enum(["draft", "finalized", "paid"]))).toBe(
      '"draft" | "finalized" | "paid"',
    );
  });

  it("converts single-value enum", () => {
    expect(zodToTypeScript(z.enum(["active"]))).toBe('"active"');
  });

  // ── Literals ──

  it("converts string literal", () => {
    expect(zodToTypeScript(z.literal("hello"))).toBe('"hello"');
  });

  it("converts number literal", () => {
    expect(zodToTypeScript(z.literal(42))).toBe("42");
  });

  it("converts boolean literal", () => {
    expect(zodToTypeScript(z.literal(true))).toBe("true");
  });

  // ── Optional / Default ──

  it("unwraps optional to inner type", () => {
    expect(zodToTypeScript(z.string().optional())).toBe("string");
  });

  it("unwraps default to inner type", () => {
    expect(zodToTypeScript(z.number().default(50))).toBe("number");
  });

  // ── Nullable ──

  it("converts nullable", () => {
    expect(zodToTypeScript(z.string().nullable())).toBe("string | null");
  });

  // ── Arrays ──

  it("converts simple array", () => {
    expect(zodToTypeScript(z.array(z.string()))).toBe("string[]");
  });

  it("converts complex array with parens", () => {
    expect(zodToTypeScript(z.array(z.union([z.string(), z.number()])))).toBe(
      "(string | number)[]",
    );
  });

  // ── Objects ──

  it("converts empty object", () => {
    expect(zodToTypeScript(z.object({}))).toBe("{}");
  });

  it("converts object with fields", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const result = zodToTypeScript(schema);
    expect(result).toContain("name: string");
    expect(result).toContain("age: number");
  });

  it("marks optional fields with ?", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      defaulted: z.number().default(10),
    });
    const result = zodToTypeScript(schema);
    expect(result).toContain("required: string");
    expect(result).toContain("optional?: string");
    expect(result).toContain("defaulted?: number");
  });

  // ── Nested ──

  it("converts nested objects", () => {
    const schema = z.object({
      address: z.object({
        street: z.string(),
        city: z.string(),
      }),
    });
    const result = zodToTypeScript(schema);
    expect(result).toContain("address: {");
    expect(result).toContain("street: string");
    expect(result).toContain("city: string");
  });

  it("converts array of objects", () => {
    const schema = z.array(z.object({ id: z.string() }));
    const result = zodToTypeScript(schema);
    expect(result).toContain("id: string");
    expect(result).toContain("[]");
  });

  // ── Descriptions ──

  it("includes field descriptions as JSDoc", () => {
    const schema = z.object({
      name: z.string().describe("The user's name"),
    });
    const result = zodToTypeScript(schema);
    expect(result).toContain("/** The user's name */");
  });

  // ── Union ──

  it("converts union", () => {
    expect(zodToTypeScript(z.union([z.string(), z.number()]))).toBe("string | number");
  });

  // ── Record ──

  it("converts record", () => {
    expect(zodToTypeScript(z.record(z.string(), z.number()))).toBe("Record<string, number>");
  });

  // ── Effects ──

  it("unwraps effects/refinements", () => {
    const schema = z.string().refine((s) => s.length > 0);
    expect(zodToTypeScript(schema)).toBe("string");
  });
});

describe("generateToolDeclaration", () => {
  it("generates a function declaration", () => {
    const result = generateToolDeclaration("get_invoices", "List invoices with filters.", {
      status: z.enum(["draft", "finalized", "paid"]).optional().describe("Filter by status"),
      limit: z.number().optional().default(50).describe("Max results"),
    });

    expect(result).toContain("/** List invoices with filters. */");
    expect(result).toContain("function get_invoices(args:");
    expect(result).toContain('status?: "draft" | "finalized" | "paid"');
    expect(result).toContain("limit?: number");
    expect(result).toContain("): Promise<ToolResult>;");
  });

  it("handles multiline descriptions by taking first line", () => {
    const result = generateToolDeclaration("test", "First line.\nSecond line.", {});
    expect(result).toContain("/** First line. */");
    expect(result).not.toContain("Second line");
  });
});

describe("generateDeclarationsBlock", () => {
  it("generates full namespace block", () => {
    const tools = [
      {
        name: "get_invoices",
        description: "List invoices.",
        inputSchema: { status: z.string().optional() },
      },
      {
        name: "get_customers",
        description: "List customers.",
        inputSchema: { limit: z.number().default(50) },
      },
    ];

    const result = generateDeclarationsBlock(tools);

    expect(result).toContain("interface ToolResult");
    expect(result).toContain("declare namespace cynco");
    expect(result).toContain("function get_invoices");
    expect(result).toContain("function get_customers");
    expect(result).toContain("}");
  });

  it("handles empty tools array", () => {
    const result = generateDeclarationsBlock([]);
    expect(result).toContain("interface ToolResult");
    expect(result).toContain("declare namespace cynco");
    expect(result).toContain("}");
  });
});
