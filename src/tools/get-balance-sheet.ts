import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getBalanceSheetSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  asOfPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Balance sheet as of this period (YYYY-MM). Defaults to current month."),
};

export async function getBalanceSheet(args: {
  clientId?: string;
  accountingFirmId?: string;
  asOfPeriod?: string;
}) {
  try {
    const tenant = resolveTenant(args);

    const now = new Date();
    const asOfPeriod = args.asOfPeriod ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get COA
    const tw = tenantWhere(tenant, 1);
    const coaResult = await query(
      `SELECT id FROM chart_of_accounts WHERE ${tw.sql} AND is_active = true LIMIT 1`,
      tw.params,
    );
    if (coaResult.rows.length === 0) {
      return errorResponse("No active Chart of Accounts found for this tenant.");
    }
    const coaId = coaResult.rows[0].id;

    // Get the latest account balance up to the as-of period for each account
    // This gives us the closing balance which represents the cumulative position
    // Params: $1=coaId, $2=asOfPeriod, $3=tenantValue
    const abTw = tenantWhere(tenant, 3, "ab");
    const result = await query(
      `SELECT DISTINCT ON (a.id)
          a.id AS account_id,
          a.account_code,
          a.account_name,
          a.account_type,
          a.normal_balance,
          a.is_header_account,
          a.parent_account_id,
          a.level,
          ab.closing_balance,
          ab.period AS balance_period
       FROM accounts a
       LEFT JOIN account_balances ab
         ON ab.account_id = a.id
         AND ab.period <= $2::text
         AND ${abTw.sql}
       WHERE a.coa_id = $1
         AND a.account_type IN ('asset', 'contra_asset', 'liability', 'equity', 'contra_equity')
         AND a.is_active = true
       ORDER BY a.id, ab.period DESC`,
      [coaId, asOfPeriod, ...abTw.params],
    );

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    const assetAccounts: Array<Record<string, unknown>> = [];
    const liabilityAccounts: Array<Record<string, unknown>> = [];
    const equityAccounts: Array<Record<string, unknown>> = [];

    for (const r of result.rows) {
      const balance = parseFloat((r.closing_balance as string) ?? "0");

      const account = {
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        isHeaderAccount: r.is_header_account,
        parentAccountId: r.parent_account_id,
        level: r.level,
        balance: balance.toFixed(2),
        balancePeriod: r.balance_period ?? null,
      };

      const isAsset = r.account_type === "asset" || r.account_type === "contra_asset";
      const isLiability = r.account_type === "liability";
      const isEquity = r.account_type === "equity" || r.account_type === "contra_equity";

      if (isAsset) {
        assetAccounts.push(account);
        if (!r.is_header_account) totalAssets += balance;
      } else if (isLiability) {
        liabilityAccounts.push(account);
        if (!r.is_header_account) totalLiabilities += balance;
      } else if (isEquity) {
        equityAccounts.push(account);
        if (!r.is_header_account) totalEquity += balance;
      }
    }

    const liabilitiesAndEquity = totalLiabilities + totalEquity;
    const isBalanced = Math.abs(totalAssets - liabilitiesAndEquity) < 0.01;

    return successResponse({
      asOfPeriod,
      assets: {
        accounts: assetAccounts,
        total: totalAssets.toFixed(2),
      },
      liabilities: {
        accounts: liabilityAccounts,
        total: totalLiabilities.toFixed(2),
      },
      equity: {
        accounts: equityAccounts,
        total: totalEquity.toFixed(2),
      },
      totalLiabilitiesAndEquity: liabilitiesAndEquity.toFixed(2),
      isBalanced,
      balanceDifference: (totalAssets - liabilitiesAndEquity).toFixed(2),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
