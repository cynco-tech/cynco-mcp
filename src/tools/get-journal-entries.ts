import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getJournalEntriesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  period: z.string().optional().describe("Filter by period (YYYY-MM format)"),
  status: z.enum(["draft", "posted", "approved", "voided"]).optional().describe("Filter by entry status"),
  source: z.string().optional().describe("Filter by source (manual, import, adjustment, etc.)"),
  limit: z.number().min(1).max(200).optional().default(50).describe("Max entries to return (max 200)"),
  offset: z.number().optional().default(0).describe("Pagination offset"),
};

export async function getJournalEntries(args: {
  clientId?: string;
  accountingFirmId?: string;
  period?: string;
  status?: "draft" | "posted" | "approved" | "voided";
  source?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "je");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.period) {
      filters += ` AND je.period = $${nextParam}`;
      params.push(args.period);
      nextParam++;
    }

    if (args.status) {
      filters += ` AND je.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }

    if (args.source) {
      filters += ` AND je.source = $${nextParam}`;
      params.push(args.source);
      nextParam++;
    }

    const limit = Math.min(args.limit ?? 50, 200);
    const offset = args.offset ?? 0;

    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM journal_entries je
       WHERE ${tw.sql} ${filters}`,
      params,
    );

    const totalEntries = parseInt((countResult.rows[0]?.total as string) ?? "0", 10);

    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT je.id, je.entry_number, je.entry_date, je.period, je.status,
              je.source, je.source_reference, je.description, je.memo,
              je.vendor_id, je.vendor_name, je.customer_id, je.customer_name,
              je.total_debit, je.total_credit, je.is_balanced, je.currency,
              je.created_by, je.created_at
       FROM journal_entries je
       WHERE ${tw.sql} ${filters}
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      dataParams,
    );

    return successResponse({
      entries: result.rows.map((e) => ({
        id: e.id,
        entryNumber: e.entry_number,
        entryDate: e.entry_date,
        period: e.period,
        status: e.status,
        source: e.source,
        sourceReference: e.source_reference,
        description: e.description,
        memo: e.memo,
        vendorId: e.vendor_id,
        vendorName: e.vendor_name,
        customerId: e.customer_id,
        customerName: e.customer_name,
        totalDebit: e.total_debit,
        totalCredit: e.total_credit,
        isBalanced: e.is_balanced,
        currency: e.currency,
        createdBy: e.created_by,
        createdAt: e.created_at,
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
