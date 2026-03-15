import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getInvoicesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  status: z.enum(["draft", "finalized", "paid", "partially_paid", "overdue", "quotation"]).optional().describe("Filter by invoice status"),
  customerId: z.string().optional().describe("Filter by customer ID"),
  fromDate: z.string().optional().describe("Invoices created on or after (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("Invoices created on or before (YYYY-MM-DD)"),
  includeArchived: z.boolean().optional().default(false).describe("Include archived invoices"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getInvoices(args: {
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
    const tw = tenantWhere(tenant, 1, "i");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (!args.includeArchived) {
      filters += ` AND (i.is_archived = false OR i.is_archived IS NULL)`;
    }
    if (args.status) {
      filters += ` AND i.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.customerId) {
      filters += ` AND i.customer_id = $${nextParam}`;
      params.push(args.customerId);
      nextParam++;
    }
    if (args.fromDate) {
      filters += ` AND i.created_at >= $${nextParam}::timestamp`;
      params.push(args.fromDate);
      nextParam++;
    }
    if (args.toDate) {
      filters += ` AND i.created_at <= ($${nextParam}::date + interval '1 day')`;
      params.push(args.toDate);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.customer_id,
          i.customer_name,
          i.customer_email,
          i.currency,
          i.total_amount,
          i.paid_amount,
          i.has_deposit,
          i.deposit_amount,
          i.due_date,
          i.payment_terms,
          i.line_items,
          i.taxes,
          i.memo,
          i.source,
          i.email_sent,
          i.email_sent_at,
          i.journal_entry_id,
          i.created_at,
          i.updated_at
       FROM invoices i
       WHERE ${tw.sql} ${filters}
       ORDER BY i.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const invoices = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      status: r.status,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      currency: r.currency,
      totalAmount: r.total_amount,
      paidAmount: r.paid_amount,
      outstandingAmount: (parseFloat(r.total_amount as string) - parseFloat((r.paid_amount ?? "0") as string)).toFixed(2),
      hasDeposit: r.has_deposit,
      depositAmount: r.deposit_amount,
      dueDate: r.due_date,
      paymentTerms: r.payment_terms,
      lineItems: r.line_items,
      taxes: r.taxes,
      memo: r.memo,
      source: r.source,
      emailSent: r.email_sent,
      emailSentAt: r.email_sent_at,
      journalEntryId: r.journal_entry_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return successResponse({
      invoices,
      invoiceCount: invoices.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
