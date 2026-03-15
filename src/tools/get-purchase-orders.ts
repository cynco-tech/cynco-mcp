import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getPurchaseOrdersSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  status: z.enum(["draft", "pending_approval", "approved", "partially_received", "received", "closed", "rejected", "void"]).optional().describe("Filter by PO status"),
  vendorId: z.string().optional().describe("Filter by vendor ID"),
  fromDate: z.string().optional().describe("POs created on or after (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("POs created on or before (YYYY-MM-DD)"),
  includeArchived: z.boolean().optional().default(false).describe("Include archived purchase orders"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getPurchaseOrders(args: {
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
    const tw = tenantWhere(tenant, 1, "po");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (!args.includeArchived) {
      filters += ` AND (po.is_archived = false OR po.is_archived IS NULL)`;
    }
    if (args.status) {
      filters += ` AND po.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.vendorId) {
      filters += ` AND po.vendor_id = $${nextParam}`;
      params.push(args.vendorId);
      nextParam++;
    }
    if (args.fromDate) {
      filters += ` AND po.created_at >= $${nextParam}::timestamp`;
      params.push(args.fromDate);
      nextParam++;
    }
    if (args.toDate) {
      filters += ` AND po.created_at <= ($${nextParam}::date + interval '1 day')`;
      params.push(args.toDate);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          po.id,
          po.po_number,
          po.vendor_id,
          po.vendor_name,
          v.email AS vendor_email,
          po.status,
          po.currency,
          po.subtotal_amount,
          po.tax_amount,
          po.total_amount,
          po.line_items,
          po.issue_date,
          po.expected_delivery_date,
          po.memo,
          po.created_at
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po.vendor_id
       WHERE ${tw.sql} ${filters}
       ORDER BY po.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const purchaseOrders = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      poNumber: r.po_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorEmail: r.vendor_email,
      status: r.status,
      currency: r.currency,
      subtotalAmount: r.subtotal_amount,
      taxAmount: r.tax_amount,
      totalAmount: r.total_amount,
      lineItems: r.line_items,
      issueDate: r.issue_date,
      expectedDeliveryDate: r.expected_delivery_date,
      memo: r.memo,
      createdAt: r.created_at,
    }));

    return successResponse({
      purchaseOrders,
      purchaseOrderCount: purchaseOrders.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
