import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const searchJournalEntriesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  query: z.string().min(1).max(200).describe("Search query — matches description, memo, entry number, document number, vendor/customer name"),
  status: z.enum(["draft", "posted", "approved", "voided"]).optional().describe("Filter by status"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD)"),
  minAmount: z.number().min(0).optional().describe("Minimum total debit amount"),
  maxAmount: z.number().min(0).optional().describe("Maximum total debit amount"),
  limit: z.number().int().min(1).max(100).optional().default(20).describe("Max results (default 20, max 100)"),
};

export async function searchJournalEntries(args: {
  clientId?: string;
  accountingFirmId?: string;
  query: string;
  status?: "draft" | "posted" | "approved" | "voided";
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "je");

    const searchLike = `%${args.query.toLowerCase()}%`;
    const params: unknown[] = [...tw.params, searchLike];
    let nextParam = tw.nextParam + 1;

    let filters = "";
    if (args.status) {
      filters += ` AND je.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.fromDate) {
      filters += ` AND je.entry_date >= $${nextParam}`;
      params.push(args.fromDate);
      nextParam++;
    }
    if (args.toDate) {
      filters += ` AND je.entry_date <= $${nextParam}`;
      params.push(args.toDate);
      nextParam++;
    }
    if (args.minAmount !== undefined) {
      filters += ` AND je.total_debit >= $${nextParam}`;
      params.push(args.minAmount);
      nextParam++;
    }
    if (args.maxAmount !== undefined) {
      filters += ` AND je.total_debit <= $${nextParam}`;
      params.push(args.maxAmount);
      nextParam++;
    }

    const limit = args.limit ?? 20;
    params.push(limit);

    const result = await query(
      `SELECT
          je.id,
          je.entry_number,
          je.entry_date,
          je.period,
          je.status,
          je.source,
          je.description,
          je.memo,
          je.document_type,
          je.document_number,
          je.vendor_name,
          je.customer_name,
          je.total_debit,
          je.total_credit,
          je.currency,
          je.created_by,
          je.created_at
       FROM journal_entries je
       WHERE ${tw.sql}
         AND (
           LOWER(je.description) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(je.memo, '')) LIKE $${tw.nextParam}
           OR LOWER(je.entry_number) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(je.document_number, '')) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(je.vendor_name, '')) LIKE $${tw.nextParam}
           OR LOWER(COALESCE(je.customer_name, '')) LIKE $${tw.nextParam}
         )
         ${filters}
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT $${nextParam}`,
      params,
    );

    const entries = result.rows.map((r) => ({
      id: r.id,
      entryNumber: r.entry_number,
      entryDate: r.entry_date,
      period: r.period,
      status: r.status,
      source: r.source,
      description: r.description,
      memo: r.memo,
      documentType: r.document_type,
      documentNumber: r.document_number,
      vendorName: r.vendor_name,
      customerName: r.customer_name,
      totalDebit: r.total_debit,
      totalCredit: r.total_credit,
      currency: r.currency,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));

    return successResponse({
      query: args.query,
      entries,
      resultCount: entries.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
