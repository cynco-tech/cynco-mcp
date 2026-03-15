import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getPeriodStatusSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  year: z.number().int().min(2000).max(2100).optional().describe("Filter by year. Defaults to all years."),
};

export async function getPeriodStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  year?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "ab");

    const params: unknown[] = [...tw.params];
    let yearFilter = "";
    if (args.year) {
      yearFilter = ` AND ab.year = $${tw.nextParam}`;
      params.push(args.year);
    }

    // Get period summary from account_balances
    const result = await query(
      `SELECT
          ab.period,
          ab.year,
          ab.month,
          COUNT(*) AS account_count,
          COUNT(*) FILTER (WHERE ab.is_closed = true) AS closed_count,
          SUM(ab.period_debit) AS total_period_debit,
          SUM(ab.period_credit) AS total_period_credit,
          SUM(ab.transaction_count) AS total_transactions,
          SUM(ab.journal_entry_count) AS total_journal_entries,
          MIN(ab.last_activity_at) AS earliest_activity,
          MAX(ab.last_activity_at) AS latest_activity,
          MAX(ab.closed_at) AS closed_at,
          MAX(ab.closed_by) AS closed_by
       FROM account_balances ab
       WHERE ${tw.sql} ${yearFilter}
       GROUP BY ab.period, ab.year, ab.month
       ORDER BY ab.period`,
      params,
    );

    // Also count draft JEs per period
    const twJe = tenantWhere(tenant, 1, "je");
    const jeParams: unknown[] = [...twJe.params];
    let jeYearFilter = "";
    if (args.year) {
      jeYearFilter = ` AND je.period LIKE $${twJe.nextParam}`;
      jeParams.push(`${args.year}-%`);
    }

    const draftResult = await query(
      `SELECT je.period, COUNT(*) AS draft_count
       FROM journal_entries je
       WHERE ${twJe.sql} AND je.status = 'draft' ${jeYearFilter}
       GROUP BY je.period`,
      jeParams,
    );

    const draftsByPeriod = new Map(
      draftResult.rows.map((r) => [r.period, parseInt(r.draft_count as string, 10)]),
    );

    const periods = result.rows.map((r) => {
      const accountCount = parseInt(r.account_count as string, 10);
      const closedCount = parseInt(r.closed_count as string, 10);

      return {
        period: r.period,
        year: r.year,
        month: r.month,
        status: closedCount === accountCount ? "closed" :
                closedCount > 0 ? "partially_closed" : "open",
        accountCount,
        closedCount,
        totalPeriodDebit: r.total_period_debit,
        totalPeriodCredit: r.total_period_credit,
        totalTransactions: parseInt(r.total_transactions as string, 10),
        totalJournalEntries: parseInt(r.total_journal_entries as string, 10),
        draftJournalEntries: draftsByPeriod.get(r.period) ?? 0,
        earliestActivity: r.earliest_activity,
        latestActivity: r.latest_activity,
        closedAt: r.closed_at,
        closedBy: r.closed_by,
      };
    });

    return successResponse({
      periods,
      periodCount: periods.length,
      openPeriods: periods.filter((p) => p.status === "open").length,
      closedPeriods: periods.filter((p) => p.status === "closed").length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
