import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getRecurringInvoicesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  status: z.enum(["active", "paused", "expired", "cancelled"]).optional().describe("Filter by template status"),
  customerId: z.string().optional().describe("Filter by customer ID"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results (default 50, max 100)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getRecurringInvoices(args: {
  clientId?: string;
  accountingFirmId?: string;
  status?: string;
  customerId?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "rit");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.status) {
      filters += ` AND rit.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }
    if (args.customerId) {
      filters += ` AND rit.customer_id = $${nextParam}`;
      params.push(args.customerId);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          rit.id,
          rit.frequency,
          rit.day_of_month,
          rit.day_of_week,
          rit.start_date,
          rit.end_date,
          rit.next_generation_date,
          rit.status,
          rit.customer_id,
          rit.customer_name,
          rit.customer_email,
          rit.currency,
          rit.total_amount,
          rit.line_items,
          rit.payment_terms,
          rit.auto_send,
          rit.auto_finalize,
          rit.total_generated,
          rit.last_generated_at,
          rit.memo,
          rit.created_at
       FROM recurring_invoice_templates rit
       WHERE ${tw.sql} ${filters}
       ORDER BY rit.next_generation_date ASC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const templates = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      frequency: r.frequency,
      dayOfMonth: r.day_of_month,
      dayOfWeek: r.day_of_week,
      startDate: r.start_date,
      endDate: r.end_date,
      nextGenerationDate: r.next_generation_date,
      status: r.status,
      customerId: r.customer_id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      currency: r.currency,
      totalAmount: r.total_amount,
      lineItems: typeof r.line_items === "string" ? JSON.parse(r.line_items) : r.line_items,
      paymentTerms: r.payment_terms,
      autoSend: r.auto_send,
      autoFinalize: r.auto_finalize,
      totalGenerated: r.total_generated,
      lastGeneratedAt: r.last_generated_at,
      memo: r.memo,
      createdAt: r.created_at,
    }));

    return successResponse({
      recurringInvoices: templates,
      recurringInvoiceCount: templates.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
