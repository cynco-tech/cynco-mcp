import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getVendorAgingSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  asOfDate: z.string().optional().describe("Calculate aging as of this date (YYYY-MM-DD). Defaults to today."),
  vendorId: z.string().optional().describe("Filter to a specific vendor"),
};

export async function getVendorAging(args: {
  clientId?: string;
  accountingFirmId?: string;
  asOfDate?: string;
  vendorId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "b");
    const asOfDate = args.asOfDate ?? new Date().toISOString().split("T")[0];

    const params: unknown[] = [...tw.params, asOfDate];
    let nextParam = tw.nextParam + 1;
    let vendorFilter = "";

    if (args.vendorId) {
      vendorFilter = `AND b.vendor_id = $${nextParam}`;
      params.push(args.vendorId);
      nextParam++;
    }

    // Query unpaid/partially paid bills grouped by vendor with aging buckets
    const result = await query(
      `SELECT
          b.vendor_id,
          b.vendor_name,
          COUNT(*) AS bill_count,
          SUM(b.total_amount) AS total_amount,
          SUM(COALESCE(bp.paid, 0)) AS total_paid,
          SUM(b.total_amount - COALESCE(bp.paid, 0)) AS outstanding,
          SUM(CASE WHEN ($${tw.nextParam}::date - b.due_date::date) <= 0
            THEN b.total_amount - COALESCE(bp.paid, 0) ELSE 0 END) AS current_amount,
          SUM(CASE WHEN ($${tw.nextParam}::date - b.due_date::date) BETWEEN 1 AND 30
            THEN b.total_amount - COALESCE(bp.paid, 0) ELSE 0 END) AS days_1_30,
          SUM(CASE WHEN ($${tw.nextParam}::date - b.due_date::date) BETWEEN 31 AND 60
            THEN b.total_amount - COALESCE(bp.paid, 0) ELSE 0 END) AS days_31_60,
          SUM(CASE WHEN ($${tw.nextParam}::date - b.due_date::date) BETWEEN 61 AND 90
            THEN b.total_amount - COALESCE(bp.paid, 0) ELSE 0 END) AS days_61_90,
          SUM(CASE WHEN ($${tw.nextParam}::date - b.due_date::date) > 90
            THEN b.total_amount - COALESCE(bp.paid, 0) ELSE 0 END) AS days_over_90
       FROM bills b
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS paid
         FROM bill_payments WHERE bill_id = b.id
       ) bp ON true
       WHERE ${tw.sql}
         AND b.is_archived = false
         AND b.status IN ('awaiting_payment', 'partially_paid', 'overdue')
         AND b.due_date IS NOT NULL
         ${vendorFilter}
       GROUP BY b.vendor_id, b.vendor_name
       ORDER BY SUM(b.total_amount - COALESCE(bp.paid, 0)) DESC`,
      params,
    );

    // Calculate totals using raw numbers to avoid floating-point drift
    let totalOutstanding = 0;
    let currentAmount = 0;
    let days1_30 = 0;
    let days31_60 = 0;
    let days61_90 = 0;
    let daysOver90 = 0;

    const vendors = result.rows.map((r) => {
      totalOutstanding += parseFloat(r.outstanding as string);
      currentAmount += parseFloat(r.current_amount as string);
      days1_30 += parseFloat(r.days_1_30 as string);
      days31_60 += parseFloat(r.days_31_60 as string);
      days61_90 += parseFloat(r.days_61_90 as string);
      daysOver90 += parseFloat(r.days_over_90 as string);

      return {
        vendorId: r.vendor_id,
        vendorName: r.vendor_name,
        billCount: parseInt(r.bill_count as string, 10),
        totalAmount: r.total_amount,
        totalPaid: r.total_paid,
        outstanding: r.outstanding,
        current: r.current_amount,
        days1_30: r.days_1_30,
        days31_60: r.days_31_60,
        days61_90: r.days_61_90,
        daysOver90: r.days_over_90,
      };
    });

    return successResponse({
      asOfDate,
      vendors,
      totals: {
        totalOutstanding: totalOutstanding.toFixed(2),
        currentAmount: currentAmount.toFixed(2),
        days1_30: days1_30.toFixed(2),
        days31_60: days31_60.toFixed(2),
        days61_90: days61_90.toFixed(2),
        daysOver90: daysOver90.toFixed(2),
      },
      vendorCount: vendors.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
