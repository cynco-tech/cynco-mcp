import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getBillsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  status: z.enum(["draft", "in_review", "pending_approval", "approved", "awaiting_payment", "scheduled", "paid", "rejected", "void"]).optional().describe("Filter by bill status"),
  vendorId: z.string().optional().describe("Filter by vendor ID"),
  fromDate: z.string().optional().describe("Bills with issue date on or after (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("Bills with issue date on or before (YYYY-MM-DD)"),
  includeArchived: z.boolean().optional().default(false).describe("Include archived bills"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getBills(args: {
  clientId?: string;
  accountingFirmId?: string;
  status?: string;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "b");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (!args.includeArchived) {
      filters += ` AND (b.is_archived = false OR b.is_archived IS NULL)`;
    }
    if (args.status) {
      filters += ` AND b.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.vendorId) {
      filters += ` AND b.vendor_id = $${nextParam}`;
      params.push(args.vendorId);
      nextParam++;
    }
    if (args.fromDate) {
      filters += ` AND b.issue_date >= $${nextParam}::timestamp`;
      params.push(args.fromDate);
      nextParam++;
    }
    if (args.toDate) {
      filters += ` AND b.issue_date <= ($${nextParam}::date + interval '1 day')`;
      params.push(args.toDate);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          b.id,
          b.bill_number,
          b.reference_number,
          b.vendor_id,
          b.vendor_name,
          b.status,
          b.currency,
          b.subtotal_amount,
          b.tax_amount,
          b.total_amount,
          COALESCE(bp.paid_amount, 0) AS paid_amount,
          b.line_items,
          b.issue_date,
          b.due_date,
          b.category,
          b.memo,
          b.created_at
       FROM bills b
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS paid_amount
         FROM bill_payments
         WHERE bill_id = b.id AND status = 'completed'
       ) bp ON true
       WHERE ${tw.sql} ${filters}
       ORDER BY b.issue_date DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const bills = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      billNumber: r.bill_number,
      referenceNumber: r.reference_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      status: r.status,
      currency: r.currency,
      subtotalAmount: r.subtotal_amount,
      taxAmount: r.tax_amount,
      totalAmount: r.total_amount,
      paidAmount: r.paid_amount,
      outstandingAmount: (parseFloat(r.total_amount as string) - parseFloat((r.paid_amount ?? "0") as string)).toFixed(2),
      lineItems: r.line_items,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      category: r.category,
      memo: r.memo,
      createdAt: r.created_at,
    }));

    return successResponse({
      bills,
      billCount: bills.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
