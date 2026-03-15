import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getReconciliationStatusSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  accountId: z.string().optional().describe("Filter to a specific account"),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Filter by period (YYYY-MM)"),
};

export async function getReconciliationStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  accountId?: string;
  period?: string;
}) {
  try {
    const tenant = resolveTenant(args);

    // GL has no tenant columns on staging — join to journal_entries
    const twJe = tenantWhere(tenant, 1, "je");
    const params: unknown[] = [...twJe.params];
    let nextParam = twJe.nextParam;

    let accountFilter = "";
    if (args.accountId) {
      accountFilter = `AND gl.account_id = $${nextParam}`;
      params.push(args.accountId);
      nextParam++;
    }

    let periodFilter = "";
    if (args.period) {
      periodFilter = `AND gl.period = $${nextParam}`;
      params.push(args.period);
      nextParam++;
    }

    const result = await query(
      `SELECT
          gl.account_id,
          a.account_code,
          a.account_name,
          a.account_type,
          COUNT(*) AS total_entries,
          COUNT(*) FILTER (WHERE gl.is_reconciled = true) AS reconciled_count,
          COUNT(*) FILTER (WHERE gl.is_reconciled = false) AS unreconciled_count,
          SUM(gl.debit_amount) FILTER (WHERE gl.is_reconciled = true) AS reconciled_debits,
          SUM(gl.credit_amount) FILTER (WHERE gl.is_reconciled = true) AS reconciled_credits,
          SUM(gl.debit_amount) FILTER (WHERE gl.is_reconciled = false) AS unreconciled_debits,
          SUM(gl.credit_amount) FILTER (WHERE gl.is_reconciled = false) AS unreconciled_credits
       FROM general_ledger gl
       JOIN journal_entries je ON je.id = gl.journal_entry_id
       JOIN accounts a ON a.id = gl.account_id
       WHERE ${twJe.sql}
         ${accountFilter}
         ${periodFilter}
       GROUP BY gl.account_id, a.account_code, a.account_name, a.account_type
       ORDER BY a.account_code`,
      params,
    );

    let totalReconciled = 0;
    let totalUnreconciled = 0;

    const accounts = result.rows.map((r) => {
      const reconciled = parseInt(r.reconciled_count as string, 10);
      const unreconciled = parseInt(r.unreconciled_count as string, 10);
      totalReconciled += reconciled;
      totalUnreconciled += unreconciled;

      return {
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        totalEntries: parseInt(r.total_entries as string, 10),
        reconciledCount: reconciled,
        unreconciledCount: unreconciled,
        reconciledDebits: r.reconciled_debits ?? "0.00",
        reconciledCredits: r.reconciled_credits ?? "0.00",
        unreconciledDebits: r.unreconciled_debits ?? "0.00",
        unreconciledCredits: r.unreconciled_credits ?? "0.00",
      };
    });

    return successResponse({
      period: args.period ?? "all",
      accounts,
      totals: {
        totalEntries: totalReconciled + totalUnreconciled,
        reconciled: totalReconciled,
        unreconciled: totalUnreconciled,
        percentReconciled: totalReconciled + totalUnreconciled > 0
          ? ((totalReconciled / (totalReconciled + totalUnreconciled)) * 100).toFixed(1)
          : "0.0",
      },
      accountCount: accounts.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
