import { z } from "zod";
import { query } from "../db.js";
import { successResponse, errorResponse } from "../utils/validation.js";

// Tables that should never be exposed via schema search
const FORBIDDEN_TABLES = new Set([
  "payment_api_keys",
  "ai_api_keys",
  "mcp_api_keys",
  "card_details",
  "einvoice_credentials",
  "users",              // PII — use get_team_members instead
  "cli_auth_sessions",  // auth sessions
  "__drizzle_migrations",
]);

// Pre-built schema with 15-minute TTL (invalidates after migrations deploy)
const SCHEMA_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedSchema: SchemaInfo | null = null;
let cacheExpiresAt = 0;

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
}

interface TableInfo {
  table: string;
  columns: ColumnInfo[];
  foreignKeys: { column: string; references: string }[];
}

interface SchemaInfo {
  tables: Record<string, TableInfo>;
  tenantTables: string[];
}

async function loadSchema(): Promise<SchemaInfo> {
  if (cachedSchema && Date.now() < cacheExpiresAt) return cachedSchema;

  // Load columns for accounting-relevant tables
  const colResult = await query(
    `SELECT table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`,
  );

  // Load foreign keys
  const fkResult = await query(
    `SELECT
       tc.table_name,
       kcu.column_name,
       ccu.table_name || '.' || ccu.column_name AS references
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
     ORDER BY tc.table_name`,
  );

  const tables: Record<string, TableInfo> = {};
  const tenantTables: string[] = [];

  for (const row of colResult.rows) {
    const tableName = row.table_name as string;
    if (tableName.startsWith("__") || FORBIDDEN_TABLES.has(tableName)) continue;

    if (!tables[tableName]) {
      tables[tableName] = { table: tableName, columns: [], foreignKeys: [] };
    }
    tables[tableName].columns.push({
      name: row.column_name as string,
      type: row.data_type as string,
      nullable: row.is_nullable === "YES",
    });
  }

  for (const row of fkResult.rows) {
    const tableName = row.table_name as string;
    if (tables[tableName]) {
      tables[tableName].foreignKeys.push({
        column: row.column_name as string,
        references: row.references as string,
      });
    }
  }

  // Identify tables with tenant columns
  for (const [name, info] of Object.entries(tables)) {
    const hasClientId = info.columns.some((c) => c.name === "client_id");
    const hasFirmId = info.columns.some((c) => c.name === "accounting_firm_id");
    if (hasClientId || hasFirmId) {
      tenantTables.push(name);
    }
  }

  cachedSchema = { tables, tenantTables };
  cacheExpiresAt = Date.now() + SCHEMA_CACHE_TTL_MS;
  return cachedSchema;
}

export const searchSchemaSchema = {
  search: z.string().max(200).describe(
    "Search term — matches against table names, column names, and types. Examples: 'invoice', 'journal', 'bank', 'customer', 'vendor', 'balance'",
  ),
  tableOnly: z.boolean().optional().default(false).describe(
    "If true, return only matching table names (compact). If false, include columns and foreign keys.",
  ),
};

export async function searchSchema(args: {
  search: string;
  tableOnly?: boolean;
}) {
  try {
    const schema = await loadSchema();
    const searchLower = args.search.toLowerCase();

    const matches: TableInfo[] = [];

    for (const info of Object.values(schema.tables)) {
      const tableMatch = info.table.toLowerCase().includes(searchLower);
      const columnMatch = info.columns.some(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.type.toLowerCase().includes(searchLower),
      );

      if (tableMatch || columnMatch) {
        matches.push(info);
      }
    }

    // Sort: exact table name matches first, then partial
    matches.sort((a, b) => {
      const aExact = a.table.toLowerCase() === searchLower ? 0 : 1;
      const bExact = b.table.toLowerCase() === searchLower ? 0 : 1;
      return aExact - bExact || a.table.localeCompare(b.table);
    });

    if (args.tableOnly) {
      return successResponse({
        tables: matches.map((m) => ({
          table: m.table,
          columnCount: m.columns.length,
          hasTenantScope: schema.tenantTables.includes(m.table),
        })),
        matchCount: matches.length,
      });
    }

    // Limit to 10 full table descriptions to avoid token bloat
    const limited = matches.slice(0, 10);

    return successResponse({
      tables: limited.map((m) => ({
        table: m.table,
        hasTenantScope: schema.tenantTables.includes(m.table),
        columns: m.columns.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
        })),
        foreignKeys: m.foreignKeys,
      })),
      matchCount: matches.length,
      showing: limited.length,
      hint: matches.length > 10
        ? "Showing first 10 matches. Use a more specific search term or tableOnly=true to see all."
        : undefined,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
