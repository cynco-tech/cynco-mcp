import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getCashFlowSummarySchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 12 months ago."),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  financialAccountId: z.string().optional().describe("Filter to a specific financial account"),
};

export async function getCashFlowSummary(args: {
  clientId?: string;
  accountingFirmId?: string;
  fromDate?: string;
  toDate?: string;
  financialAccountId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "bt");

    const today = new Date();
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const fromDate = args.fromDate ?? twelveMonthsAgo.toISOString().split("T")[0];
    const toDate = args.toDate ?? today.toISOString().split("T")[0];

    const params: unknown[] = [...tw.params, fromDate, toDate];
    let nextParam = tw.nextParam + 2;
    let accountFilter = "";

    if (args.financialAccountId) {
      accountFilter = `AND bt.financial_account_id = $${nextParam}`;
      params.push(args.financialAccountId);
      nextParam++;
    }

    // Monthly cash flow from bank transactions
    const result = await query(
      `SELECT
          TO_CHAR(bt.transaction_date, 'YYYY-MM') AS month,
          SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE 0 END) AS total_inflows,
          SUM(CASE WHEN bt.transaction_type = 'debit' THEN bt.amount ELSE 0 END) AS total_outflows,
          SUM(CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE 0 END) -
          SUM(CASE WHEN bt.transaction_type = 'debit' THEN bt.amount ELSE 0 END) AS net_cash_flow,
          COUNT(*) FILTER (WHERE bt.transaction_type = 'credit') AS inflow_count,
          COUNT(*) FILTER (WHERE bt.transaction_type = 'debit') AS outflow_count
       FROM bank_transactions bt
       WHERE ${tw.sql}
         AND bt.transaction_date >= $${tw.nextParam}
         AND bt.transaction_date <= $${tw.nextParam + 1}
         AND bt.status != 'excluded'
         ${accountFilter}
       GROUP BY TO_CHAR(bt.transaction_date, 'YYYY-MM')
       ORDER BY month`,
      params,
    );

    // Also get top categories by spend (outflows)
    const categoryResult = await query(
      `SELECT
          COALESCE(bt.category, 'Uncategorized') AS category,
          SUM(bt.amount) AS total_amount,
          COUNT(*) AS transaction_count,
          bt.transaction_type
       FROM bank_transactions bt
       WHERE ${tw.sql}
         AND bt.transaction_date >= $${tw.nextParam}
         AND bt.transaction_date <= $${tw.nextParam + 1}
         AND bt.status != 'excluded'
         ${accountFilter}
       GROUP BY COALESCE(bt.category, 'Uncategorized'), bt.transaction_type
       ORDER BY SUM(bt.amount) DESC
       LIMIT 20`,
      params,
    );

    const months = result.rows.map((r) => ({
      month: r.month,
      totalInflows: r.total_inflows,
      totalOutflows: r.total_outflows,
      netCashFlow: r.net_cash_flow,
      inflowCount: parseInt(r.inflow_count as string, 10),
      outflowCount: parseInt(r.outflow_count as string, 10),
    }));

    // Calculate grand totals
    let grandInflows = 0;
    let grandOutflows = 0;
    for (const m of months) {
      grandInflows += parseFloat(m.totalInflows as string);
      grandOutflows += parseFloat(m.totalOutflows as string);
    }

    const categories = categoryResult.rows.map((r) => ({
      category: r.category,
      transactionType: r.transaction_type,
      totalAmount: r.total_amount,
      transactionCount: parseInt(r.transaction_count as string, 10),
    }));

    return successResponse({
      fromDate,
      toDate,
      months,
      totals: {
        totalInflows: grandInflows.toFixed(2),
        totalOutflows: grandOutflows.toFixed(2),
        netCashFlow: (grandInflows - grandOutflows).toFixed(2),
      },
      topCategories: categories,
      monthCount: months.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
