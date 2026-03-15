import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getChartOfAccountsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  includeInactive: z.boolean().optional().default(false).describe("Include inactive accounts"),
  accountType: z
    .enum([
      "asset", "contra_asset", "liability", "equity", "contra_equity",
      "revenue", "contra_revenue", "expense", "contra_expense",
    ])
    .optional()
    .describe("Filter accounts by type"),
  compact: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return only id, accountCode, accountName, accountType per account — much smaller response for LLM context"),
};

export async function getChartOfAccounts(args: {
  clientId?: string;
  accountingFirmId?: string;
  includeInactive?: boolean;
  accountType?: string;
  compact?: boolean;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant);

    const coaResult = await query(
      `SELECT id, name, description, source, base_currency, fiscal_year_end,
              current_period, account_count, is_active, is_locked,
              industry, accounting_standard, allow_multi_currency
       FROM chart_of_accounts
       WHERE ${tw.sql} AND is_active = true
       ORDER BY CASE WHEN access_type = 'specific' THEN 0 ELSE 1 END
       LIMIT 1`,
      tw.params,
    );

    if (coaResult.rows.length === 0) {
      return errorResponse("No active chart of accounts found for this tenant.");
    }

    const coa = coaResult.rows[0];

    const filters: string[] = [];
    const params: unknown[] = [coa.id];
    let nextParam = 2;

    if (!args.includeInactive) {
      filters.push("AND a.is_active = true");
    }
    if (args.accountType) {
      filters.push(`AND a.account_type = $${nextParam}`);
      params.push(args.accountType);
      nextParam++;
    }

    const columns = args.compact
      ? "a.id, a.account_code, a.account_name, a.account_type"
      : `a.id, a.account_code, a.account_name, a.account_type,
              a.normal_balance, a.parent_account_id, a.level, a.is_active,
              a.is_header_account, a.is_bank_account, a.is_cash_account,
              a.mapping_keywords, a.common_vendors, a.description`;

    const accountsResult = await query(
      `SELECT ${columns}
       FROM accounts a
       WHERE a.coa_id = $1 ${filters.join(" ")}
       ORDER BY a.account_code`,
      params,
    );

    const accounts = args.compact
      ? accountsResult.rows.map((a) => ({
          id: a.id,
          accountCode: a.account_code,
          accountName: a.account_name,
          accountType: a.account_type,
        }))
      : accountsResult.rows.map((a) => ({
          id: a.id,
          accountCode: a.account_code,
          accountName: a.account_name,
          accountType: a.account_type,
          normalBalance: a.normal_balance,
          parentAccountId: a.parent_account_id,
          level: a.level,
          isActive: a.is_active,
          isHeaderAccount: a.is_header_account,
          isBankAccount: a.is_bank_account,
          isCashAccount: a.is_cash_account,
          mappingKeywords: a.mapping_keywords,
          commonVendors: a.common_vendors,
          description: a.description,
        }));

    return successResponse({
      chartOfAccounts: {
        id: coa.id,
        name: coa.name,
        description: coa.description,
        source: coa.source,
        baseCurrency: coa.base_currency,
        fiscalYearEnd: coa.fiscal_year_end,
        currentPeriod: coa.current_period,
        accountCount: coa.account_count,
        isActive: coa.is_active,
        isLocked: coa.is_locked,
        industry: coa.industry,
        accountingStandard: coa.accounting_standard,
        allowMultiCurrency: coa.allow_multi_currency,
      },
      accounts,
      totalAccounts: accountsResult.rows.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
