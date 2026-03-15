import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getBankTransactionsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  financialAccountId: z.string().optional().describe("Filter by financial account"),
  status: z.enum(["imported", "categorized", "reconciled"]).optional().describe("Filter by transaction status"),
  matchStatus: z.enum(["unmatched", "suggested", "confirmed", "manual"]).optional().describe("Filter by match status"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  limit: z.number().min(1).max(500).optional().default(100).describe("Max transactions to return (max 500)"),
  offset: z.number().optional().default(0).describe("Pagination offset"),
};

export async function getBankTransactions(args: {
  clientId?: string;
  accountingFirmId?: string;
  financialAccountId?: string;
  status?: "imported" | "categorized" | "reconciled";
  matchStatus?: "unmatched" | "suggested" | "confirmed" | "manual";
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "bt");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    const filters: string[] = [];

    if (args.financialAccountId) {
      filters.push(`AND bt.financial_account_id = $${nextParam}`);
      params.push(args.financialAccountId);
      nextParam++;
    }

    if (args.status) {
      filters.push(`AND bt.status = $${nextParam}`);
      params.push(args.status);
      nextParam++;
    }

    if (args.matchStatus) {
      filters.push(`AND bt.match_status = $${nextParam}`);
      params.push(args.matchStatus);
      nextParam++;
    }

    if (args.fromDate) {
      filters.push(`AND bt.transaction_date >= $${nextParam}`);
      params.push(args.fromDate);
      nextParam++;
    }

    if (args.toDate) {
      filters.push(`AND bt.transaction_date <= $${nextParam}`);
      params.push(args.toDate);
      nextParam++;
    }

    const filterSql = filters.join(" ");
    const limit = Math.min(args.limit ?? 100, 500);
    const offset = args.offset ?? 0;

    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM bank_transactions bt
       WHERE ${tw.sql} ${filterSql}`,
      params,
    );

    const totalTransactions = parseInt((countResult.rows[0]?.total as string) ?? "0", 10);

    const dataParams = [...params, limit, offset];
    const result = await query(
      `SELECT bt.id, bt.financial_account_id, bt.transaction_date, bt.value_date,
              bt.raw_description, bt.clean_description, bt.reference,
              bt.transaction_type, bt.amount, bt.balance_after,
              bt.category, bt.payee_name, bt.suggested_coa_account_id,
              bt.match_confidence, bt.status, bt.match_status, bt.created_at,
              fa.account_name AS financial_account_name,
              a.account_code AS suggested_account_code,
              a.account_name AS suggested_account_name
       FROM bank_transactions bt
       LEFT JOIN financial_accounts fa ON fa.id = bt.financial_account_id
       LEFT JOIN accounts a ON a.id = bt.suggested_coa_account_id
       WHERE ${tw.sql} ${filterSql}
       ORDER BY bt.transaction_date DESC, bt.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      dataParams,
    );

    return successResponse({
      transactions: result.rows.map((t) => ({
        id: t.id,
        financialAccountId: t.financial_account_id,
        financialAccountName: t.financial_account_name,
        transactionDate: t.transaction_date,
        valueDate: t.value_date,
        rawDescription: t.raw_description,
        cleanDescription: t.clean_description,
        reference: t.reference,
        transactionType: t.transaction_type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        category: t.category,
        payeeName: t.payee_name,
        suggestedCoaAccountId: t.suggested_coa_account_id,
        suggestedAccountCode: t.suggested_account_code,
        suggestedAccountName: t.suggested_account_name,
        matchConfidence: t.match_confidence,
        status: t.status,
        matchStatus: t.match_status,
        createdAt: t.created_at,
      })),
      totalTransactions,
      limit,
      offset,
      hasMore: totalTransactions > offset + result.rows.length,
      ...(totalTransactions > offset + result.rows.length
        ? { nextOffset: offset + result.rows.length }
        : {}),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
