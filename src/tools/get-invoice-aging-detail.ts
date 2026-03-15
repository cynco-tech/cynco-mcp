import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getInvoiceAgingDetailSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  asOfDate: z.string().optional().describe("Calculate aging as of this date (YYYY-MM-DD). Defaults to today."),
  customerId: z.string().optional().describe("Filter to a specific customer"),
  agingBucket: z.enum(["current", "1-30", "31-60", "61-90", "over-90"]).optional().describe("Filter to a specific aging bucket"),
  limit: z.number().int().min(1).max(500).optional().default(100).describe("Max results (default 100, max 500)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getInvoiceAgingDetail(args: {
  clientId?: string;
  accountingFirmId?: string;
  asOfDate?: string;
  customerId?: string;
  agingBucket?: "current" | "1-30" | "31-60" | "61-90" | "over-90";
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "i");
    const asOfDate = args.asOfDate ?? new Date().toISOString().split("T")[0];

    const params: unknown[] = [...tw.params, asOfDate];
    let nextParam = tw.nextParam + 1;
    let filters = "";

    if (args.customerId) {
      filters += ` AND i.customer_id = $${nextParam}`;
      params.push(args.customerId);
      nextParam++;
    }

    // Aging bucket filter
    if (args.agingBucket) {
      const ref = `$${tw.nextParam}::date`;
      switch (args.agingBucket) {
        case "current":
          filters += ` AND (${ref} - i.due_date::date) <= 0`;
          break;
        case "1-30":
          filters += ` AND (${ref} - i.due_date::date) BETWEEN 1 AND 30`;
          break;
        case "31-60":
          filters += ` AND (${ref} - i.due_date::date) BETWEEN 31 AND 60`;
          break;
        case "61-90":
          filters += ` AND (${ref} - i.due_date::date) BETWEEN 61 AND 90`;
          break;
        case "over-90":
          filters += ` AND (${ref} - i.due_date::date) > 90`;
          break;
      }
    }

    const limit = args.limit ?? 100;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          i.id,
          i.invoice_number,
          i.customer_id,
          i.customer_name,
          i.status,
          i.currency,
          i.total_amount,
          i.paid_amount,
          (i.total_amount - COALESCE(i.paid_amount, 0)) AS outstanding,
          i.due_date,
          i.created_at,
          ($${tw.nextParam}::date - i.due_date::date) AS days_past_due,
          CASE
            WHEN ($${tw.nextParam}::date - i.due_date::date) <= 0 THEN 'current'
            WHEN ($${tw.nextParam}::date - i.due_date::date) BETWEEN 1 AND 30 THEN '1-30'
            WHEN ($${tw.nextParam}::date - i.due_date::date) BETWEEN 31 AND 60 THEN '31-60'
            WHEN ($${tw.nextParam}::date - i.due_date::date) BETWEEN 61 AND 90 THEN '61-90'
            ELSE 'over-90'
          END AS aging_bucket
       FROM invoices i
       WHERE ${tw.sql}
         AND i.status IN ('finalized', 'partially_paid', 'overdue', 'awaiting_payment')
         AND i.due_date IS NOT NULL
         AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
         AND (i.is_archived = false OR i.is_archived IS NULL)
         ${filters}
       ORDER BY ($${tw.nextParam}::date - i.due_date::date) DESC, i.total_amount DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const invoices = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      customerId: r.customer_id,
      customerName: r.customer_name,
      status: r.status,
      currency: r.currency,
      totalAmount: r.total_amount,
      paidAmount: r.paid_amount,
      outstanding: r.outstanding,
      dueDate: r.due_date,
      daysPastDue: parseInt(r.days_past_due as string, 10),
      agingBucket: r.aging_bucket,
      createdAt: r.created_at,
    }));

    // Summary by bucket
    const buckets: Record<string, { count: number; total: number }> = {
      current: { count: 0, total: 0 },
      "1-30": { count: 0, total: 0 },
      "31-60": { count: 0, total: 0 },
      "61-90": { count: 0, total: 0 },
      "over-90": { count: 0, total: 0 },
    };

    for (const inv of invoices) {
      const bucket = inv.agingBucket as string;
      if (buckets[bucket]) {
        buckets[bucket].count++;
        buckets[bucket].total += parseFloat(inv.outstanding as string);
      }
    }

    const bucketSummary = Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, {
        count: v.count,
        total: v.total.toFixed(2),
      }]),
    );

    return successResponse({
      asOfDate,
      invoices,
      invoiceCount: invoices.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      bucketSummary,
      totalOutstanding: Object.values(buckets).reduce((s, b) => s + b.total, 0).toFixed(2),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
