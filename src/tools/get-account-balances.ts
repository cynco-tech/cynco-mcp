import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getAccountBalancesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  period: z.string().optional().describe("Filter by period (YYYY-MM format)"),
};

export async function getAccountBalances(args: {
  clientId?: string;
  accountingFirmId?: string;
  period?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "ab");

    const params: unknown[] = [...tw.params];
    let periodFilter = "";
    if (args.period) {
      periodFilter = `AND ab.period = $${tw.nextParam}`;
      params.push(args.period);
    }

    const result = await query(
      `SELECT ab.account_id, a.account_code, a.account_name, a.account_type,
              a.normal_balance, ab.period,
              ab.opening_balance, ab.period_debit, ab.period_credit,
              ab.closing_balance, ab.ytd_debit, ab.ytd_credit,
              ab.transaction_count
       FROM account_balances ab
       JOIN accounts a ON a.id = ab.account_id
       WHERE ${tw.sql} ${periodFilter}
       ORDER BY a.account_code, ab.period`,
      params,
    );

    return successResponse({
      balances: result.rows.map((b) => ({
        accountId: b.account_id,
        accountCode: b.account_code,
        accountName: b.account_name,
        accountType: b.account_type,
        normalBalance: b.normal_balance,
        period: b.period,
        openingBalance: b.opening_balance,
        periodDebit: b.period_debit,
        periodCredit: b.period_credit,
        closingBalance: b.closing_balance,
        ytdDebit: b.ytd_debit,
        ytdCredit: b.ytd_credit,
        transactionCount: b.transaction_count,
      })),
      totalBalances: result.rows.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
