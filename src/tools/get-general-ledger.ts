import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getGeneralLedgerSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  accountId: z.string().optional().describe("Filter by account ID"),
  period: z.string().optional().describe("Filter by period (YYYY-MM)"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  isReconciled: z.boolean().optional().describe("Filter by reconciliation status"),
  limit: z.number().min(1).max(500).optional().default(100).describe("Max entries to return (max 500)"),
  offset: z.number().optional().default(0).describe("Pagination offset"),
};

export async function getGeneralLedger(args: {
  clientId?: string;
  accountingFirmId?: string;
  accountId?: string;
  period?: string;
  fromDate?: string;
  toDate?: string;
  isReconciled?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);

    if (args.accountId) {
      validateTypeId(args.accountId, "acc", "accountId");
    }

    // GL has no direct tenant column — scope via journal_entries join
    const tw = tenantWhere(tenant, 1, "je");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.accountId) {
      filters += ` AND gl.account_id = $${nextParam}`;
      params.push(args.accountId);
      nextParam++;
    }

    if (args.period) {
      filters += ` AND gl.period = $${nextParam}`;
      params.push(args.period);
      nextParam++;
    }

    if (args.fromDate) {
      filters += ` AND gl.transaction_date >= $${nextParam}`;
      params.push(args.fromDate);
      nextParam++;
    }

    if (args.toDate) {
      filters += ` AND gl.transaction_date <= $${nextParam}`;
      params.push(args.toDate);
      nextParam++;
    }

    if (args.isReconciled !== undefined) {
      filters += ` AND gl.is_reconciled = $${nextParam}`;
      params.push(args.isReconciled);
      nextParam++;
    }

    const limit = Math.min(args.limit ?? 100, 500);
    const offset = args.offset ?? 0;

    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM general_ledger gl
       JOIN journal_entries je ON gl.journal_entry_id = je.id
       WHERE ${tw.sql} ${filters}`,
      params,
    );

    const totalEntries = parseInt((countResult.rows[0]?.total as string) ?? "0", 10);

    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT gl.id, gl.account_id, gl.journal_entry_id, gl.journal_entry_line_id,
              gl.transaction_date, gl.posting_date, gl.period,
              gl.debit_amount, gl.credit_amount, gl.running_balance,
              gl.description, gl.reference, gl.currency,
              gl.is_reconciled, gl.reconciled_date, gl.reconciled_by,
              gl.reconciliation_reference, gl.created_at,
              a.account_code, a.account_name, a.account_type,
              je.entry_number, je.source
       FROM general_ledger gl
       JOIN journal_entries je ON gl.journal_entry_id = je.id
       JOIN accounts a ON gl.account_id = a.id
       WHERE ${tw.sql} ${filters}
       ORDER BY gl.transaction_date DESC, gl.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      dataParams,
    );

    return successResponse({
      entries: result.rows.map((r) => ({
        id: r.id,
        accountId: r.account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        accountType: r.account_type,
        journalEntryId: r.journal_entry_id,
        entryNumber: r.entry_number,
        source: r.source,
        transactionDate: r.transaction_date,
        postingDate: r.posting_date,
        period: r.period,
        debitAmount: r.debit_amount,
        creditAmount: r.credit_amount,
        runningBalance: r.running_balance,
        description: r.description,
        reference: r.reference,
        currency: r.currency,
        isReconciled: r.is_reconciled,
        reconciledDate: r.reconciled_date,
        reconciledBy: r.reconciled_by,
        reconciliationReference: r.reconciliation_reference,
        createdAt: r.created_at,
      })),
      totalEntries,
      limit,
      offset,
      hasMore: totalEntries > offset + result.rows.length,
      ...(totalEntries > offset + result.rows.length
        ? { nextOffset: offset + result.rows.length }
        : {}),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
