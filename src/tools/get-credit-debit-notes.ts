import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getCreditDebitNotesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  noteType: z.enum(["credit", "debit"]).optional().describe("Filter by note type"),
  status: z.enum(["draft", "issued", "partially_applied", "fully_applied", "voided"]).optional().describe("Filter by status"),
  customerId: z.string().optional().describe("Filter by customer ID"),
  invoiceId: z.string().optional().describe("Filter by original invoice ID"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results (default 50, max 100)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getCreditDebitNotes(args: {
  clientId?: string;
  accountingFirmId?: string;
  noteType?: "credit" | "debit";
  status?: string;
  customerId?: string;
  invoiceId?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "cdn");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.noteType) {
      filters += ` AND cdn.note_type = $${nextParam}`;
      params.push(args.noteType);
      nextParam++;
    }
    if (args.status) {
      filters += ` AND cdn.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.customerId) {
      filters += ` AND cdn.customer_id = $${nextParam}`;
      params.push(args.customerId);
      nextParam++;
    }
    if (args.invoiceId) {
      filters += ` AND cdn.original_invoice_id = $${nextParam}`;
      params.push(args.invoiceId);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          cdn.id,
          cdn.note_type,
          cdn.note_number,
          cdn.original_invoice_id,
          cdn.customer_id,
          cdn.customer_name,
          cdn.customer_email,
          cdn.currency,
          cdn.subtotal,
          cdn.tax_amount,
          cdn.total_amount,
          cdn.applied_amount,
          cdn.remaining_amount,
          cdn.paid_amount,
          cdn.line_items,
          cdn.reason,
          cdn.reason_category,
          cdn.status,
          cdn.refund_status,
          cdn.refund_amount,
          cdn.issued_at,
          cdn.issued_by,
          cdn.voided_at,
          cdn.void_reason,
          cdn.internal_notes,
          cdn.created_at,
          cdn.updated_at
       FROM credit_debit_notes cdn
       WHERE ${tw.sql} ${filters}
       ORDER BY cdn.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const notes = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      noteType: r.note_type,
      noteNumber: r.note_number,
      originalInvoiceId: r.original_invoice_id,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      currency: r.currency,
      subtotal: r.subtotal,
      taxAmount: r.tax_amount,
      totalAmount: r.total_amount,
      appliedAmount: r.applied_amount,
      remainingAmount: r.remaining_amount,
      paidAmount: r.paid_amount,
      lineItems: r.line_items,
      reason: r.reason,
      reasonCategory: r.reason_category,
      status: r.status,
      refundStatus: r.refund_status,
      refundAmount: r.refund_amount,
      issuedAt: r.issued_at,
      issuedBy: r.issued_by,
      voidedAt: r.voided_at,
      voidReason: r.void_reason,
      internalNotes: r.internal_notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return successResponse({
      notes,
      noteCount: notes.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
