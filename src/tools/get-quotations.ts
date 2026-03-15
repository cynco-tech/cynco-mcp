import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getQuotationsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  status: z.enum(["draft", "sent", "viewed", "accepted", "rejected", "expired", "converted"]).optional().describe("Filter by quotation status"),
  customerId: z.string().optional().describe("Filter by customer ID"),
  fromDate: z.string().optional().describe("Quotations created on or after (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("Quotations created on or before (YYYY-MM-DD)"),
  includeArchived: z.boolean().optional().default(false).describe("Include archived quotations"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getQuotations(args: {
  clientId?: string;
  accountingFirmId?: string;
  status?: string;
  customerId?: string;
  fromDate?: string;
  toDate?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "q");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (!args.includeArchived) {
      filters += ` AND (q.is_archived = false OR q.is_archived IS NULL)`;
    }
    if (args.status) {
      filters += ` AND q.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.customerId) {
      filters += ` AND q.customer_id = $${nextParam}`;
      params.push(args.customerId);
      nextParam++;
    }
    if (args.fromDate) {
      filters += ` AND q.created_at >= $${nextParam}::timestamp`;
      params.push(args.fromDate);
      nextParam++;
    }
    if (args.toDate) {
      filters += ` AND q.created_at <= ($${nextParam}::date + interval '1 day')`;
      params.push(args.toDate);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          q.id,
          q.quotation_number,
          q.customer_id,
          q.customer_name,
          q.customer_email,
          q.status,
          q.currency,
          q.total_amount,
          q.taxes,
          q.line_items,
          q.valid_until,
          q.revision_number,
          q.converted_to_invoice_id,
          q.memo,
          q.created_at
       FROM quotations q
       WHERE ${tw.sql} ${filters}
       ORDER BY q.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const quotations = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      quotationNumber: r.quotation_number,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      status: r.status,
      currency: r.currency,
      totalAmount: r.total_amount,
      taxes: r.taxes,
      lineItems: typeof r.line_items === "string" ? JSON.parse(r.line_items) : r.line_items,
      validUntil: r.valid_until,
      revisionNumber: r.revision_number,
      convertedToInvoiceId: r.converted_to_invoice_id,
      memo: r.memo,
      createdAt: r.created_at,
    }));

    return successResponse({
      quotations,
      quotationCount: quotations.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
