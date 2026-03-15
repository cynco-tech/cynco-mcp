import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const searchBankTransactionsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  query: z.string().min(1).max(200).describe("Search query — matches raw/clean description, payee name, category, reference"),
  transactionType: z.enum(["credit", "debit"]).optional().describe("Filter by transaction type"),
  status: z.enum(["imported", "categorized", "posted", "excluded", "reconciled"]).optional().describe("Filter by status"),
  minAmount: z.number().min(0).optional().describe("Minimum amount"),
  maxAmount: z.number().min(0).optional().describe("Maximum amount"),
  limit: z.number().int().min(1).max(100).optional().default(20).describe("Max results (default 20, max 100)"),
};

export async function searchBankTransactions(args: {
  clientId?: string;
  accountingFirmId?: string;
  query: string;
  transactionType?: "credit" | "debit";
  status?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "bt");

    const searchLike = `%${args.query.toLowerCase()}%`;
    const params: unknown[] = [...tw.params, searchLike];
    let nextParam = tw.nextParam + 1;

    let filters = "";
    if (args.transactionType) {
      filters += ` AND bt.transaction_type = $${nextParam}`;
      params.push(args.transactionType);
      nextParam++;
    }
    if (args.status) {
      filters += ` AND bt.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.minAmount !== undefined) {
      filters += ` AND bt.amount >= $${nextParam}`;
      params.push(args.minAmount);
      nextParam++;
    }
    if (args.maxAmount !== undefined) {
      filters += ` AND bt.amount <= $${nextParam}`;
      params.push(args.maxAmount);
      nextParam++;
    }

    const limit = args.limit ?? 20;
    params.push(limit);

    const result = await query(
      `SELECT
          bt.id,
          bt.financial_account_id,
          bt.transaction_date,
          bt.transaction_type,
          bt.amount,
          bt.raw_description,
          bt.clean_description,
          bt.payee_name,
          bt.category,
          bt.reference,
          bt.status,
          bt.match_status,
          bt.suggested_coa_account_id,
          bt.match_confidence,
          bt.created_at
       FROM bank_transactions bt
       WHERE ${tw.sql}
         AND (
           LOWER(bt.raw_description) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(bt.clean_description, '')) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(bt.payee_name, '')) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(bt.category, '')) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(bt.reference, '')) LIKE $${tw.nextParam}
         )
         ${filters}
       ORDER BY bt.transaction_date DESC, bt.created_at DESC
       LIMIT $${nextParam}`,
      params,
    );

    const transactions = result.rows.map((r) => ({
      id: r.id,
      financialAccountId: r.financial_account_id,
      transactionDate: r.transaction_date,
      transactionType: r.transaction_type,
      amount: r.amount,
      rawDescription: r.raw_description,
      cleanDescription: r.clean_description,
      payeeName: r.payee_name,
      category: r.category,
      reference: r.reference,
      status: r.status,
      matchStatus: r.match_status,
      suggestedCoaAccountId: r.suggested_coa_account_id,
      matchConfidence: r.match_confidence,
      createdAt: r.created_at,
    }));

    return successResponse({
      query: args.query,
      transactions,
      resultCount: transactions.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
