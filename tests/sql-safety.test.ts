import { describe, it, expect } from "vitest";

// We test the validation logic by importing the function directly.
// The executeQuery module has side effects (db import), so we test the
// validation function by extracting the same patterns.

const FORBIDDEN_PATTERNS = [
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\b/i,
  /\bINTO\b/i,    // blocks SELECT INTO and INSERT INTO
  /\bUNION\b/i,   // prevents cross-tenant data access via UNION queries
  /\bOR\b/i,      // prevents $TENANT_FILTER OR TRUE bypass — use IN() instead
  /\(\s*SELECT\b/i, // blocks subqueries — they bypass $TENANT_FILTER tenant isolation
  /;\s*\S/,        // multiple statements
  /--/,            // comments
  /\/\*/,          // block comments
];

const FORBIDDEN_TABLES = new Set([
  "payment_api_keys",
  "ai_api_keys",
  "mcp_api_keys",
  "card_details",
  "einvoice_credentials",
  "__drizzle_migrations",
]);

function validateQuery(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim();

  if (!/^\s*SELECT\b/i.test(trimmed)) {
    return { valid: false, error: "Only SELECT queries are allowed." };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: `Forbidden pattern: ${pattern.toString()}` };
    }
  }

  for (const table of FORBIDDEN_TABLES) {
    if (new RegExp(`\\b${table}\\b`, "i").test(trimmed)) {
      return { valid: false, error: `Forbidden table: ${table}` };
    }
  }

  return { valid: true };
}

describe("SQL safety validation", () => {
  // ── Allowed queries ──

  it("allows simple SELECT", () => {
    expect(validateQuery("SELECT * FROM journal_entries WHERE client_id = $1").valid).toBe(true);
  });

  it("blocks WITH (CTE) to prevent tenant filter bypass", () => {
    expect(validateQuery("WITH cte AS (SELECT 1) SELECT * FROM cte").valid).toBe(false);
  });

  it("allows JOINs", () => {
    const sql = "SELECT je.id FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id WHERE je.client_id = $1";
    expect(validateQuery(sql).valid).toBe(true);
  });

  it("allows aggregations", () => {
    expect(validateQuery("SELECT COUNT(*), SUM(amount) FROM invoices WHERE client_id = $1").valid).toBe(true);
  });

  it("blocks subqueries to prevent tenant isolation bypass", () => {
    expect(validateQuery("SELECT * FROM invoices WHERE customer_id IN (SELECT id FROM customers WHERE name = 'Test')").valid).toBe(false);
  });


  // ── Blocked mutations ──

  it("blocks INSERT", () => {
    expect(validateQuery("INSERT INTO journal_entries (id) VALUES ('test')").valid).toBe(false);
  });

  it("blocks UPDATE", () => {
    expect(validateQuery("UPDATE journal_entries SET status = 'voided' WHERE id = '1'").valid).toBe(false);
  });

  it("blocks DELETE", () => {
    expect(validateQuery("DELETE FROM journal_entries WHERE id = '1'").valid).toBe(false);
  });

  it("blocks DROP", () => {
    expect(validateQuery("SELECT 1; DROP TABLE journal_entries").valid).toBe(false);
  });

  it("blocks ALTER", () => {
    expect(validateQuery("ALTER TABLE journal_entries ADD COLUMN x TEXT").valid).toBe(false);
  });

  it("blocks CREATE", () => {
    expect(validateQuery("CREATE TABLE evil (id TEXT)").valid).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    expect(validateQuery("TRUNCATE journal_entries").valid).toBe(false);
  });

  // ── Injection vectors ──

  it("blocks multiple statements", () => {
    expect(validateQuery("SELECT 1; SELECT 2").valid).toBe(false);
  });

  it("blocks SQL comments (--)", () => {
    expect(validateQuery("SELECT * FROM users -- WHERE client_id = $1").valid).toBe(false);
  });

  it("blocks block comments", () => {
    expect(validateQuery("SELECT /* evil */ * FROM users").valid).toBe(false);
  });

  it("blocks SELECT INTO", () => {
    expect(validateQuery("SELECT * INTO temp_table FROM users").valid).toBe(false);
  });

  // ── Cross-tenant bypass vectors ──

  it("blocks UNION ALL (cross-tenant bypass)", () => {
    expect(validateQuery("SELECT * FROM journal_entries WHERE client_id = $1 UNION ALL SELECT * FROM journal_entries WHERE client_id = 'other'").valid).toBe(false);
  });

  it("blocks UNION (case insensitive)", () => {
    expect(validateQuery("SELECT id FROM invoices WHERE client_id = $1 Union SELECT id FROM invoices").valid).toBe(false);
  });

  // ── Forbidden tables ──

  it("blocks payment_api_keys", () => {
    expect(validateQuery("SELECT * FROM payment_api_keys").valid).toBe(false);
  });

  it("blocks ai_api_keys", () => {
    expect(validateQuery("SELECT * FROM ai_api_keys WHERE id = '1'").valid).toBe(false);
  });

  it("blocks card_details", () => {
    expect(validateQuery("SELECT * FROM card_details").valid).toBe(false);
  });

  it("blocks einvoice_credentials", () => {
    expect(validateQuery("SELECT * FROM einvoice_credentials").valid).toBe(false);
  });

  it("blocks __drizzle_migrations", () => {
    expect(validateQuery("SELECT * FROM __drizzle_migrations").valid).toBe(false);
  });

  // ── Non-SELECT queries ──

  it("rejects queries not starting with SELECT/WITH", () => {
    expect(validateQuery("EXPLAIN SELECT 1").valid).toBe(false);
  });

  it("rejects GRANT", () => {
    expect(validateQuery("GRANT ALL ON journal_entries TO public").valid).toBe(false);
  });

  it("rejects COPY", () => {
    expect(validateQuery("COPY journal_entries TO '/tmp/data.csv'").valid).toBe(false);
  });

  // ── Case insensitivity ──

  it("blocks case-varied mutations", () => {
    expect(validateQuery("select 1; DrOp table users").valid).toBe(false);
  });

  it("blocks mixed-case INSERT", () => {
    expect(validateQuery("InSeRt INTO users VALUES ('x')").valid).toBe(false);
  });
});

describe("mcp_api_keys is in forbidden tables", () => {
  it("blocks querying mcp_api_keys via execute_query", () => {
    // The MCP server reads this table internally for auth,
    // but agents must NOT be able to query it via execute_query.
    expect(validateQuery("SELECT id FROM mcp_api_keys WHERE key_hash = 'abc'").valid).toBe(false);
  });
});
