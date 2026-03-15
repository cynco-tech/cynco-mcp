import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getFinancialSummarySchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
};

export async function getFinancialSummary(args: {
  clientId?: string;
  accountingFirmId?: string;
}) {
  try {
    const tenant = resolveTenant(args);

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

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Run all summary queries in parallel
    const abTw = tenantWhere(tenant, 2, "ab");
    const jeTw = tenantWhere(tenant, 1, "je");
    const btTw = tenantWhere(tenant, 1, "bt");
    const invTw = tenantWhere(tenant, 1, "i");
    const billTw = tenantWhere(tenant, 1, "b");

    const [balanceSummary, jeSummary, btSummary, arSummary, apSummary] = await Promise.all([
      // Account balance totals by type for latest period
      query(
        `SELECT
            a.account_type,
            SUM(ab.closing_balance) AS total_balance
         FROM account_balances ab
         JOIN accounts a ON a.id = ab.account_id AND a.is_header_account = false
         WHERE ab.period = $1 AND ${abTw.sql}
         GROUP BY a.account_type`,
        [currentPeriod, ...abTw.params],
      ),

      // Journal entry counts by status
      query(
        `SELECT
            je.status,
            COUNT(*) AS count,
            SUM(je.total_debit) AS total_amount
         FROM journal_entries je
         WHERE ${jeTw.sql}
         GROUP BY je.status`,
        jeTw.params,
      ),

      // Bank transaction counts by status
      query(
        `SELECT
            bt.status,
            COUNT(*) AS count,
            SUM(bt.amount) AS total_amount
         FROM bank_transactions bt
         WHERE ${btTw.sql}
         GROUP BY bt.status`,
        btTw.params,
      ),

      // Outstanding AR
      query(
        `SELECT
            COUNT(*) AS invoice_count,
            COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0) AS outstanding
         FROM invoices i
         WHERE ${invTw.sql}
           AND i.status IN ('awaiting_payment', 'partially_paid', 'overdue', 'finalized')
           AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0`,
        invTw.params,
      ),

      // Outstanding AP
      query(
        `SELECT
            COUNT(*) AS bill_count,
            COALESCE(SUM(b.total_amount - COALESCE(bp.total_paid, 0)), 0) AS outstanding
         FROM bills b
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(amount), 0) AS total_paid
           FROM bill_payments WHERE bill_id = b.id AND status = 'completed'
         ) bp ON true
         WHERE ${billTw.sql}
           AND b.status IN ('awaiting_payment', 'partially_paid', 'overdue')
           AND (b.total_amount - COALESCE(bp.total_paid, 0)) > 0`,
        billTw.params,
      ),
    ]);

    // Parse balance summary
    const balances: Record<string, string> = {};
    for (const r of balanceSummary.rows) {
      balances[r.account_type as string] = parseFloat(r.total_balance as string).toFixed(2);
    }

    // Parse JE summary
    const journalEntries: Record<string, { count: number; totalAmount: string }> = {};
    for (const r of jeSummary.rows) {
      journalEntries[r.status as string] = {
        count: parseInt(r.count as string, 10),
        totalAmount: parseFloat(r.total_amount as string).toFixed(2),
      };
    }

    // Parse bank transaction summary
    const bankTransactions: Record<string, { count: number; totalAmount: string }> = {};
    for (const r of btSummary.rows) {
      bankTransactions[r.status as string] = {
        count: parseInt(r.count as string, 10),
        totalAmount: parseFloat(r.total_amount as string).toFixed(2),
      };
    }

    const arRow = arSummary.rows[0];
    const apRow = apSummary.rows[0];

    return successResponse({
      currentPeriod,
      balancesByType: balances,
      journalEntries,
      bankTransactions,
      accountsReceivable: {
        outstandingInvoices: parseInt(arRow?.invoice_count as string ?? "0", 10),
        totalOutstanding: parseFloat(arRow?.outstanding as string ?? "0").toFixed(2),
      },
      accountsPayable: {
        outstandingBills: parseInt(apRow?.bill_count as string ?? "0", 10),
        totalOutstanding: parseFloat(apRow?.outstanding as string ?? "0").toFixed(2),
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
