import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getAccountActivitySchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  accountId: z.string().describe("Account ID to get activity for"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  limit: z.number().int().min(1).max(500).optional().default(100).describe("Max entries (default 100, max 500)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getAccountActivity(args: {
  clientId?: string;
  accountingFirmId?: string;
  accountId: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.accountId, "acc", "accountId");

    // Get account details
    const twCoa = tenantWhere(tenant, 1);
    const accountResult = await query(
      `SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance
       FROM accounts a
       JOIN chart_of_accounts coa ON coa.id = a.coa_id
       WHERE a.id = $${twCoa.nextParam} AND ${twCoa.sql} AND coa.is_active = true`,
      [...twCoa.params, args.accountId],
    );

    if (accountResult.rows.length === 0) {
      return errorResponse("Account not found or does not belong to this tenant.");
    }

    const account = accountResult.rows[0];

    // Build GL query with tenant scoping via journal_entries
    const twJe = tenantWhere(tenant, 2, "je");
    const params: unknown[] = [args.accountId, ...twJe.params];
    let nextParam = twJe.nextParam;

    let dateFilters = "";
    if (args.fromDate) {
      dateFilters += ` AND gl.transaction_date >= $${nextParam}`;
      params.push(args.fromDate);
      nextParam++;
    }
    if (args.toDate) {
      dateFilters += ` AND gl.transaction_date <= $${nextParam}`;
      params.push(args.toDate);
      nextParam++;
    }

    const limit = args.limit ?? 100;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          gl.id,
          gl.transaction_date,
          gl.posting_date,
          gl.period,
          gl.debit_amount,
          gl.credit_amount,
          gl.running_balance,
          gl.description,
          gl.reference,
          gl.is_reconciled,
          gl.journal_entry_id,
          je.entry_number,
          je.source
       FROM general_ledger gl
       JOIN journal_entries je ON je.id = gl.journal_entry_id
       WHERE gl.account_id = $1
         AND ${twJe.sql}
         ${dateFilters}
       ORDER BY gl.transaction_date, gl.created_at
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const entries = result.rows.slice(0, limit).map((r) => ({
      glEntryId: r.id,
      transactionDate: r.transaction_date,
      postingDate: r.posting_date,
      period: r.period,
      debitAmount: r.debit_amount,
      creditAmount: r.credit_amount,
      runningBalance: r.running_balance,
      description: r.description,
      reference: r.reference,
      isReconciled: r.is_reconciled,
      journalEntryId: r.journal_entry_id,
      entryNumber: r.entry_number,
      source: r.source,
    }));

    return successResponse({
      account: {
        id: account.id,
        accountCode: account.account_code,
        accountName: account.account_name,
        accountType: account.account_type,
        normalBalance: account.normal_balance,
      },
      entries,
      entryCount: entries.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
