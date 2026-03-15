import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getIncomeStatementSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Single period (YYYY-MM). If omitted, uses fromPeriod/toPeriod range."),
  fromPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Start period (YYYY-MM) for date range"),
  toPeriod: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("End period (YYYY-MM) for date range"),
};

export async function getIncomeStatement(args: {
  clientId?: string;
  accountingFirmId?: string;
  period?: string;
  fromPeriod?: string;
  toPeriod?: string;
}) {
  try {
    const tenant = resolveTenant(args);

    // Determine period range
    let fromPeriod: string;
    let toPeriod: string;

    if (args.period) {
      fromPeriod = args.period;
      toPeriod = args.period;
    } else if (args.fromPeriod && args.toPeriod) {
      fromPeriod = args.fromPeriod;
      toPeriod = args.toPeriod;
    } else {
      // Default to current year
      const year = new Date().getFullYear();
      fromPeriod = `${year}-01`;
      toPeriod = `${year}-12`;
    }

    // Get revenue and expense accounts with their period balances
    const tw = tenantWhere(tenant, 1);
    const coaResult = await query(
      `SELECT id FROM chart_of_accounts WHERE ${tw.sql} AND is_active = true LIMIT 1`,
      tw.params,
    );
    if (coaResult.rows.length === 0) {
      return errorResponse("No active Chart of Accounts found for this tenant.");
    }
    const coaId = coaResult.rows[0].id;

    // Query account balances for revenue and expense accounts
    const abTw = tenantWhere(tenant, 3, "ab");
    const result = await query(
      `SELECT
          a.id AS account_id,
          a.account_code,
          a.account_name,
          a.account_type,
          a.normal_balance,
          a.is_header_account,
          a.parent_account_id,
          a.level,
          SUM(ab.period_debit) AS total_debit,
          SUM(ab.period_credit) AS total_credit
       FROM accounts a
       LEFT JOIN account_balances ab
         ON ab.account_id = a.id
         AND ab.period >= $1
         AND ab.period <= $2
         AND ${abTw.sql}
       WHERE a.coa_id = $${abTw.nextParam}
         AND a.account_type IN ('revenue', 'contra_revenue', 'expense', 'contra_expense')
         AND a.is_active = true
       GROUP BY a.id, a.account_code, a.account_name, a.account_type,
                a.normal_balance, a.is_header_account, a.parent_account_id, a.level
       ORDER BY a.account_code`,
      [fromPeriod, toPeriod, ...abTw.params, coaId],
    );

    let totalRevenue = 0;
    let totalExpenses = 0;
    const revenueAccounts: Array<Record<string, unknown>> = [];
    const expenseAccounts: Array<Record<string, unknown>> = [];

    for (const r of result.rows) {
      const debit = parseFloat((r.total_debit as string) ?? "0");
      const credit = parseFloat((r.total_credit as string) ?? "0");

      // Revenue: normal balance is credit, so net = credit - debit
      // Expense: normal balance is debit, so net = debit - credit
      const isRevenue = r.account_type === "revenue" || r.account_type === "contra_revenue";
      const net = isRevenue ? credit - debit : debit - credit;

      const account = {
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        isHeaderAccount: r.is_header_account,
        parentAccountId: r.parent_account_id,
        level: r.level,
        periodDebit: debit.toFixed(2),
        periodCredit: credit.toFixed(2),
        netAmount: net.toFixed(2),
      };

      if (isRevenue) {
        revenueAccounts.push(account);
        if (!r.is_header_account) totalRevenue += net;
      } else {
        expenseAccounts.push(account);
        if (!r.is_header_account) totalExpenses += net;
      }
    }

    const netIncome = totalRevenue - totalExpenses;

    return successResponse({
      fromPeriod,
      toPeriod,
      revenue: {
        accounts: revenueAccounts,
        total: totalRevenue.toFixed(2),
      },
      expenses: {
        accounts: expenseAccounts,
        total: totalExpenses.toFixed(2),
      },
      netIncome: netIncome.toFixed(2),
      isProfit: netIncome >= 0,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
