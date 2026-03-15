import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const searchAccountsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  query: z.string().min(1).max(200).describe("Search query — matches against account name, code, description, and AI mapping keywords"),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]).optional().describe("Filter by account type"),
  activeOnly: z.boolean().optional().default(true).describe("Only return active accounts (default true)"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Max results (default 10, max 50)"),
};

export async function searchAccounts(args: {
  clientId?: string;
  accountingFirmId?: string;
  query: string;
  accountType?: "asset" | "liability" | "equity" | "revenue" | "expense";
  activeOnly?: boolean;
  limit?: number;
}) {
  try {
    const tenant = resolveTenant(args);

    // First get the COA for this tenant
    const coaTw = tenantWhere(tenant, 1);
    const coaResult = await query(
      `SELECT id FROM chart_of_accounts WHERE ${coaTw.sql} AND is_active = true LIMIT 1`,
      coaTw.params,
    );
    if (coaResult.rows.length === 0) {
      return errorResponse("No active Chart of Accounts found for this tenant.");
    }
    const coaId = coaResult.rows[0].id;

    const searchLike = `%${args.query.toLowerCase()}%`;
    const searchRaw = args.query.toLowerCase();
    const searchStarts = `${args.query.toLowerCase()}%`;
    // $1=coaId, $2=searchLike, $3=searchRaw, $4=searchStarts
    const params: unknown[] = [coaId, searchLike, searchRaw, searchStarts];
    let nextParam = 5;

    let typeFilter = "";
    if (args.accountType) {
      typeFilter = `AND a.account_type = $${nextParam}`;
      params.push(args.accountType);
      nextParam++;
    }

    let activeFilter = "";
    if (args.activeOnly !== false) {
      activeFilter = `AND a.is_active = true`;
    }

    const limit = args.limit ?? 10;
    params.push(limit);

    // Rank results: exact code match > name starts with > name contains > description/keywords
    const result = await query(
      `SELECT
          a.id,
          a.account_code,
          a.account_name,
          a.account_type,
          a.normal_balance,
          a.description,
          a.is_active,
          a.is_header_account,
          a.is_cash_account,
          a.is_bank_account,
          a.mapping_keywords,
          a.parent_account_id,
          a.level,
          CASE
            WHEN LOWER(a.account_code) = $3 THEN 1
            WHEN LOWER(a.account_name) LIKE $4 THEN 2
            WHEN LOWER(a.account_name) LIKE $2 THEN 3
            ELSE 4
          END AS rank
       FROM accounts a
       WHERE a.coa_id = $1
         AND (
           LOWER(a.account_code) LIKE $2
           OR LOWER(a.account_name) LIKE $2
           OR LOWER(COALESCE(a.description, '')) LIKE $2
           OR COALESCE(a.mapping_keywords::text, '') ILIKE $2
         )
         ${typeFilter}
         ${activeFilter}
       ORDER BY rank, a.account_code
       LIMIT $${nextParam}`,
      params,
    );

    const accounts = result.rows.map((r) => ({
      id: r.id,
      accountCode: r.account_code,
      accountName: r.account_name,
      accountType: r.account_type,
      normalBalance: r.normal_balance,
      description: r.description,
      isActive: r.is_active,
      isHeaderAccount: r.is_header_account,
      isCashAccount: r.is_cash_account,
      isBankAccount: r.is_bank_account,
      mappingKeywords: r.mapping_keywords,
      parentAccountId: r.parent_account_id,
      level: r.level,
    }));

    return successResponse({
      query: args.query,
      accounts,
      resultCount: accounts.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
