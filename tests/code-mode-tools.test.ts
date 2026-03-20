import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createSearchToolsHandler } from "../src/code-mode/search-tools.js";
import type { ToolRegistryEntry } from "../src/code-mode/search-tools.js";
import { createExecuteCodeHandler } from "../src/code-mode/execute-code.js";
import { deriveCategory } from "../src/code-mode/search-tools.js";

// ── Test fixtures ──

const MOCK_REGISTRY: ToolRegistryEntry[] = [
  {
    name: "get_invoices",
    description: "List invoices with status, amounts, and line items.",
    category: "invoicing",
    inputSchema: {
      status: z.enum(["draft", "finalized", "paid"]).optional(),
      limit: z.number().default(50),
    },
  },
  {
    name: "get_customers",
    description: "List customers with contact details and AR balances.",
    category: "customers",
    inputSchema: {
      search: z.string().optional(),
    },
  },
  {
    name: "get_customer_aging",
    description: "AR aging report grouped by customer and age bucket.",
    category: "customers",
    inputSchema: {},
  },
  {
    name: "get_balance_sheet",
    description: "Balance sheet report for a given period.",
    category: "reports",
    inputSchema: {
      period: z.string().optional(),
    },
  },
  {
    name: "get_income_statement",
    description: "Income statement (P&L) for a given period.",
    category: "reports",
    inputSchema: {
      period: z.string().optional(),
    },
  },
  {
    name: "create_invoice",
    description: "Create a new invoice with line items.",
    category: "invoicing",
    inputSchema: {
      customerId: z.string(),
      items: z.array(z.object({ description: z.string(), amount: z.number() })),
    },
  },
  {
    name: "get_vendors",
    description: "List vendors with contact details and AP balances.",
    category: "vendors",
    inputSchema: {},
  },
  {
    name: "get_chart_of_accounts",
    description: "Get the active Chart of Accounts.",
    category: "accounting",
    inputSchema: {
      compact: z.boolean().optional().default(false),
    },
  },
];

describe("search_tools handler", () => {
  const handler = createSearchToolsHandler(MOCK_REGISTRY);

  it("finds tools by name", async () => {
    const result = await handler({ query: "get_invoices" });
    const data = extractData(result);
    expect(data.tools).toHaveLength(1);
    expect(data.tools[0].name).toBe("get_invoices");
  });

  it("finds tools by partial name match", async () => {
    const result = await handler({ query: "invoice" });
    const data = extractData(result);
    const names = data.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_invoices");
    expect(names).toContain("create_invoice");
  });

  it("finds tools by description keyword", async () => {
    const result = await handler({ query: "aging" });
    const data = extractData(result);
    const names = data.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_customer_aging");
  });

  it("filters by category", async () => {
    const result = await handler({ query: "", category: "customers" });
    const data = extractData(result);
    expect(data.tools).toHaveLength(2);
    data.tools.forEach((t: { category: string }) => {
      expect(t.category).toBe("customers");
    });
  });

  it("combines query and category filters", async () => {
    const result = await handler({ query: "aging", category: "customers" });
    const data = extractData(result);
    expect(data.tools).toHaveLength(1);
    expect(data.tools[0].name).toBe("get_customer_aging");
  });

  it("includes TypeScript declarations by default", async () => {
    const result = await handler({ query: "invoice" });
    const data = extractData(result);
    expect(data.declarations).toBeTruthy();
    expect(data.declarations).toContain("declare namespace cynco");
    expect(data.declarations).toContain("function get_invoices");
  });

  it("omits declarations when includeDeclarations=false", async () => {
    const result = await handler({ query: "invoice", includeDeclarations: false });
    const data = extractData(result);
    expect(data.declarations).toBeUndefined();
  });

  it("reports totalAvailable", async () => {
    const result = await handler({ query: "invoice" });
    const data = extractData(result);
    expect(data.totalAvailable).toBe(MOCK_REGISTRY.length);
  });

  it("returns empty results for no matches", async () => {
    const result = await handler({ query: "zzz_nonexistent_zzz" });
    const data = extractData(result);
    expect(data.tools).toHaveLength(0);
  });

  it("ranks exact name matches higher", async () => {
    const result = await handler({ query: "get_invoices" });
    const data = extractData(result);
    expect(data.tools[0].name).toBe("get_invoices");
  });
});

describe("execute_code handler", () => {
  const toolMap = new Map([
    ["get_profile", async () => ({ success: true as const, data: { companyName: "Acme" } })],
    ["get_invoices", async (args: Record<string, unknown>) => ({
      success: true as const,
      data: { count: 3, status: (args.status as string) || "all" },
    })],
  ]);
  const handler = createExecuteCodeHandler(toolMap);

  it("executes code and returns output", async () => {
    const result = await handler({
      code: 'const r = await cynco.get_profile({}); console.log(r.data.companyName);',
    });
    const data = extractData(result);
    expect(data.output).toBe("Acme");
    expect(data.toolCalls).toBe(1);
  });

  it("rejects blocked patterns", async () => {
    const result = await handler({
      code: 'process.env.SECRET',
    });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain("process");
  });

  it("returns error for bad code", async () => {
    const result = await handler({ code: 'const x = {;' });
    expect(result.isError).toBe(true);
  });

  it("tracks duration", async () => {
    const result = await handler({
      code: 'console.log("fast");',
    });
    const data = extractData(result);
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("deriveCategory", () => {
  it("extracts module from scoped scope", () => {
    expect(deriveCategory("get_invoices", "invoicing:read")).toBe("invoicing");
  });

  it("extracts module from write scope", () => {
    expect(deriveCategory("create_invoice", "invoicing:write")).toBe("invoicing");
  });

  it("falls back to tool name segment for unscoped", () => {
    // "get_invoices" with scope "read" — "get" is a verb prefix, so returns next segment
    expect(deriveCategory("get_invoices", "read")).toBe("invoices");
    // Non-verb prefix returns first segment
    expect(deriveCategory("do_something", "read")).toBe("do");
  });
});

// ── Helpers ──

function extractData(result: { content: Array<{ type: string; text?: string }> }): Record<string, unknown> {
  const text = result.content[0]?.type === "text" ? (result.content[0] as { text: string }).text : "{}";
  const parsed = JSON.parse(text);
  return parsed.data || parsed;
}
