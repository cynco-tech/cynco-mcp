/**
 * MCP Apps registration for Cynco.
 * Registers interactive UI tools + their corresponding ui:// resources.
 * Each app is a bundled single-file HTML loaded from dist/apps/.
 *
 * Pattern: each app is a NEW tool (show_*, build_*) that sits alongside existing
 * text tools. Hosts that support MCP Apps render the UI; others see the text result.
 * The existing 107 tools are completely untouched.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { log } from "./logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPS_DIR = join(__dirname, "..", "dist", "apps");

// MIME type for MCP App resources
const APP_MIME_TYPE = "text/html; charset=utf-8";

/**
 * Load a bundled app HTML from dist/apps/<name>.html.
 * Returns null if the file doesn't exist (build step hasn't run).
 */
function loadAppHtml(name: string): string | null {
  const path = join(APPS_DIR, `${name}.html`);
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** App definition — keeps registration DRY */
interface AppDef {
  /** Tool name (e.g., "show_dashboard") */
  tool: string;
  /** Human-readable title */
  title: string;
  /** Description for the LLM */
  description: string;
  /** File name in dist/apps/ (without .html) */
  htmlFile: string;
  /** Input schema for the tool (Zod shapes) */
  inputSchema: Record<string, z.ZodType>;
  /** Whether this is read-only */
  readOnly: boolean;
}

const APPS: AppDef[] = [
  {
    tool: "show_dashboard",
    title: "Show Financial Dashboard",
    description: "Interactive financial dashboard with KPI tiles, cash flow chart, and AR/AP aging overview. Renders an interactive UI.",
    htmlFile: "dashboard",
    inputSchema: {},
    readOnly: true,
  },
  {
    tool: "show_aging_report",
    title: "Show Aging Report",
    description: "Interactive AR/AP aging report with donut chart, detail table, and drill-down to customer/vendor statements. Renders an interactive UI.",
    htmlFile: "aging",
    inputSchema: {
      type: z.enum(["ar", "ap"]).default("ar").describe("Which aging to show: 'ar' for receivables, 'ap' for payables"),
    },
    readOnly: true,
  },
  {
    tool: "show_cash_flow",
    title: "Show Cash Flow Chart",
    description: "Interactive cash flow analysis with monthly bar chart, running balance table, and top spending categories. Renders an interactive UI.",
    htmlFile: "cash-flow",
    inputSchema: {
      months: z.number().int().min(1).max(24).default(6).describe("Number of months to show (1-24)"),
    },
    readOnly: true,
  },
  {
    tool: "show_trial_balance",
    title: "Show Trial Balance",
    description: "Interactive trial balance viewer with account hierarchy grouped by type, period selector, and balance check indicator. Renders an interactive UI.",
    htmlFile: "trial-balance",
    inputSchema: {
      period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Accounting period (YYYY-MM). Defaults to current month."),
    },
    readOnly: true,
  },
  {
    tool: "show_financial_statements",
    title: "Show Financial Statements",
    description: "Interactive Income Statement (P&L) and Balance Sheet with proper accounting formatting, period selector, and view toggle. Renders an interactive UI.",
    htmlFile: "financial-statements",
    inputSchema: {
      period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Accounting period (YYYY-MM). Defaults to current month."),
      view: z.enum(["income", "balance"]).default("income").describe("Which statement to show first: 'income' for P&L, 'balance' for Balance Sheet"),
    },
    readOnly: true,
  },
  {
    tool: "build_invoice",
    title: "Build Invoice",
    description: "Interactive invoice builder form with customer picker, line item editor, item catalog, and live total calculation. Creates a draft invoice on submit. Renders an interactive UI.",
    htmlFile: "invoice-builder",
    inputSchema: {},
    readOnly: false,
  },
];

/**
 * Register all MCP App tools and their UI resources on the server.
 * Called from createServer() in server.ts.
 *
 * Uses the raw McpServer.registerTool API rather than the t() wrapper
 * from server.ts. This means app tools bypass withTenant scope checks
 * on the initial call. This is acceptable because:
 *  - App tool handlers only return the caller's own input as seed data
 *  - No tenant data is accessed or returned
 *  - All actual data operations happen via callServerTool from the UI,
 *    which routes through the host and back through the session's
 *    properly-wrapped tool handlers (with full scope enforcement)
 *  - Tools ARE in TOOL_SCOPE_MAP (fail-closed on missing entries)
 *
 * If app tools ever need to access tenant data directly, they must be
 * moved into server.ts and wrapped with t() like all other tools.
 */
export function registerApps(server: McpServer): void {
  let registered = 0;

  for (const appDef of APPS) {
    const html = loadAppHtml(appDef.htmlFile);
    if (!html) {
      log.warn("MCP App HTML not found, skipping", { app: appDef.tool, file: `${appDef.htmlFile}.html` });
      continue;
    }

    const resourceUri = `ui://cynco/${appDef.htmlFile}.html`;

    // Register the UI resource
    server.registerResource(
      `app-${appDef.htmlFile}`,
      resourceUri,
      { mimeType: APP_MIME_TYPE },
      async () => ({
        contents: [{ uri: resourceUri, mimeType: APP_MIME_TYPE, text: html }],
      }),
    );

    // Register the tool with _meta.ui pointing to the resource.
    // The tool result is "seed data" — the app uses it for initial state,
    // then calls existing tools (get_financial_summary, etc.) interactively.
    server.registerTool(appDef.tool, {
      title: appDef.title,
      description: appDef.description,
      inputSchema: appDef.inputSchema,
      annotations: {
        readOnlyHint: appDef.readOnly,
        destructiveHint: false,
        idempotentHint: appDef.readOnly,
        openWorldHint: false,
      },
      _meta: { ui: { resourceUri } },
    }, async (args: Record<string, unknown>) => {
      // Pass through input as seed data for the app
      return {
        content: [{ type: "text" as const, text: JSON.stringify(args) }],
      };
    });

    registered++;
  }

  if (registered > 0) {
    log.info("MCP Apps registered", { count: registered, total: APPS.length });
  }
}
