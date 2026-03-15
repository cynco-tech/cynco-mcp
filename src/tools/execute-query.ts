import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

const MAX_ROWS = 200;
const MAX_RESPONSE_CHARS = 24000; // ~6000 tokens

// Tables that have tenant columns and how they're named
const TENANT_COLUMNS = {
  client_id: "client_id",
  accounting_firm_id: "accounting_firm_id",
} as const;

// Tables that are safe to query but have no tenant columns
// (must be joined to a tenant-scoped table)
const TENANT_FREE_TABLES = new Set([
  "journal_entry_lines",
  "journal_entry_status_history",
  "accnt_clients",
  "users",
]);

// Forbidden tables — never expose
const FORBIDDEN_TABLES = new Set([
  "payment_api_keys",
  "ai_api_keys",
  "mcp_api_keys",
  "card_details",
  "einvoice_credentials",
  "__drizzle_migrations",
]);

// Forbidden SQL patterns
const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i,
  /\bINTO\b/i,    // blocks SELECT INTO and INSERT INTO
  /\bUNION\b/i,   // prevents cross-tenant data access via UNION queries
  /\bOR\b/i,      // prevents $TENANT_FILTER OR TRUE bypass — use IN() instead
  /;\s*\S/,        // multiple statements
  /--/,            // comments (potential injection vector)
  /\/\*/,          // block comments
];

function validateQuery(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();

  // Must start with SELECT — CTEs (WITH) are not allowed to prevent
  // hiding $TENANT_FILTER in an unused CTE and bypassing tenant isolation
  if (!/^\s*SELECT\b/i.test(trimmed)) {
    return { valid: false, error: "Only SELECT queries are allowed. Query must start with SELECT. CTEs (WITH) are not supported — use subqueries or the typed tools instead." };
  }

  // Check forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: `Forbidden SQL pattern detected: ${pattern.toString()}. Only read-only SELECT queries are allowed.` };
    }
  }

  // Check for forbidden tables
  for (const table of FORBIDDEN_TABLES) {
    if (new RegExp(`\\b${table}\\b`, "i").test(trimmed)) {
      return { valid: false, error: `Access to table "${table}" is not allowed.` };
    }
  }

  return { valid: true };
}

function truncateResponse(content: string): string {
  if (content.length <= MAX_RESPONSE_CHARS) return content;

  const truncated = content.slice(0, MAX_RESPONSE_CHARS);
  const estimatedTokens = Math.ceil(content.length / 4);
  return `${truncated}\n\n--- TRUNCATED ---\nResponse was ~${estimatedTokens.toLocaleString()} tokens. Add LIMIT, select fewer columns, or use more specific WHERE clauses.`;
}

export const executeQuerySchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  sql: z.string().min(10).max(4000).describe(
    `Read-only SQL SELECT query. IMPORTANT rules:
- Only SELECT allowed. No INSERT, UPDATE, DELETE, UNION, OR, or WITH (CTE).
- Must include $TENANT_FILTER as the FIRST condition after WHERE — replaced with the correct tenant filter.
- $TENANT_FILTER must appear exactly once and be uppercase.
- Use IN() instead of OR for multiple conditions.
- LIMIT is enforced at 200 rows max.

Example: SELECT id, entry_number, status FROM journal_entries WHERE $TENANT_FILTER AND status = 'posted' ORDER BY entry_date DESC LIMIT 20

Example with JOIN: SELECT je.entry_number, jel.account_id, jel.debit_amount FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id WHERE $TENANT_FILTER AND je.period = '2026-01' LIMIT 50

Example with IN: SELECT * FROM journal_entries WHERE $TENANT_FILTER AND status IN ('posted', 'approved') LIMIT 50`,
  ),
};

export async function executeQuery(args: {
  clientId?: string;
  accountingFirmId?: string;
  sql: string;
}) {
  try {
    const tenant = resolveTenant(args);

    // Validate the SQL
    const validation = validateQuery(args.sql);
    if (!validation.valid) {
      return errorResponse(validation.error!);
    }

    // Build tenant filter
    const tenantColumn = tenant.column;
    const tenantValue = tenant.value;

    // Enforce $TENANT_FILTER placeholder — must be exact case, appear exactly once,
    // and be directly after WHERE (first condition) to prevent bypass patterns
    const filterMatches = args.sql.match(/\$TENANT_FILTER/g);
    if (!filterMatches) {
      return errorResponse(
        "Query must include $TENANT_FILTER placeholder in the WHERE clause. " +
        "Example: SELECT * FROM journal_entries WHERE $TENANT_FILTER AND status = 'posted' LIMIT 10",
      );
    }
    if (filterMatches.length > 1) {
      return errorResponse(
        "$TENANT_FILTER must appear exactly once in the query.",
      );
    }

    // $TENANT_FILTER must appear directly after WHERE (as the first condition)
    if (!/\bWHERE\s+\$TENANT_FILTER\b/i.test(args.sql)) {
      return errorResponse(
        "$TENANT_FILTER must be the first condition after WHERE. " +
        "Example: WHERE $TENANT_FILTER AND status = 'posted'",
      );
    }

    // Reject case variants — must be exact uppercase $TENANT_FILTER
    if (/\$tenant_filter/i.test(args.sql) && !args.sql.includes("$TENANT_FILTER")) {
      return errorResponse(
        "$TENANT_FILTER must be uppercase. Use exactly: $TENANT_FILTER",
      );
    }

    // Replace $TENANT_FILTER → "column = $1" (parameterized, exact match only)
    let processedSql = args.sql;
    processedSql = processedSql.replace("$TENANT_FILTER", `${tenantColumn} = $1`);

    // Ensure LIMIT exists and is reasonable
    if (!/\bLIMIT\b/i.test(processedSql)) {
      processedSql = processedSql.replace(/;?\s*$/, ` LIMIT ${MAX_ROWS}`);
    } else {
      // Extract and cap the limit
      processedSql = processedSql.replace(
        /\bLIMIT\s+(\d+)/i,
        (_, n) => `LIMIT ${Math.min(parseInt(n, 10), MAX_ROWS)}`,
      );
    }

    // Re-validate after processing (in case placeholders created issues)
    const revalidation = validateQuery(processedSql);
    if (!revalidation.valid) {
      return errorResponse(revalidation.error!);
    }

    const startTime = Date.now();
    const result = await query(processedSql, [tenantValue]);
    const durationMs = Date.now() - startTime;

    const response = JSON.stringify({
      success: true,
      data: {
        rows: result.rows,
        rowCount: result.rows.length,
        durationMs,
        query: processedSql.replace(tenantValue, "***"),
      },
    }, null, 2);

    return {
      content: [
        {
          type: "text" as const,
          text: truncateResponse(response),
        },
      ],
    };
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
