import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getVendorStatementSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  vendorId: z.string().describe("Vendor ID"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 12 months ago."),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
};

export async function getVendorStatement(args: {
  clientId?: string;
  accountingFirmId?: string;
  vendorId: string;
  fromDate?: string;
  toDate?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.vendorId, "vend", "vendorId");

    const today = new Date();
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const fromDate = args.fromDate ?? twelveMonthsAgo.toISOString().split("T")[0];
    const toDate = args.toDate ?? today.toISOString().split("T")[0];

    // Verify vendor belongs to tenant
    const tw = tenantWhere(tenant, 2, "v");
    const vendorResult = await query(
      `SELECT v.id, v.name, v.email, v.payment_terms
       FROM vendors v
       WHERE v.id = $1 AND ${tw.sql}`,
      [args.vendorId, ...tw.params],
    );
    if (vendorResult.rows.length === 0) {
      return errorResponse("Vendor not found or does not belong to this tenant.");
    }
    const vendor = vendorResult.rows[0];

    // Calculate opening balance (bills before fromDate minus payments before fromDate)
    // Uses issue_date for bills to match the Remix model
    const twOb = tenantWhere(tenant, 2, "b");
    const obResult = await query(
      `WITH bill_totals AS (
        SELECT COALESCE(SUM(CAST(b.total_amount AS numeric)), 0) AS total
        FROM bills b
        WHERE b.vendor_id = $1
          AND ${twOb.sql}
          AND b.issue_date < $${twOb.nextParam}::timestamp
          AND b.status IN ('approved', 'awaiting_payment', 'partially_paid', 'scheduled', 'paid')
          AND b.is_archived = false
      ),
      payment_totals AS (
        SELECT COALESCE(SUM(CAST(bp.amount AS numeric)), 0) AS total
        FROM bill_payments bp
        JOIN bills b ON b.id = bp.bill_id
        WHERE b.vendor_id = $1
          AND ${twOb.sql}
          AND bp.payment_date < $${twOb.nextParam}::timestamp
          AND bp.status = 'completed'
          AND b.is_archived = false
      )
      SELECT
        (SELECT total FROM bill_totals) - (SELECT total FROM payment_totals) AS opening_balance`,
      [args.vendorId, ...twOb.params, fromDate],
    );
    const openingBalance = parseFloat((obResult.rows[0]?.opening_balance as string) ?? "0");

    // Get bills in date range — filter by issue_date to match Remix model
    const twBill = tenantWhere(tenant, 2, "b");
    const billResult = await query(
      `SELECT
          b.id,
          b.bill_number,
          b.status,
          b.issue_date,
          b.due_date,
          b.total_amount,
          b.currency
       FROM bills b
       WHERE b.vendor_id = $1
         AND ${twBill.sql}
         AND b.issue_date >= $${twBill.nextParam}::timestamp
         AND b.issue_date <= ($${twBill.nextParam + 1}::date + interval '1 day' - interval '1 millisecond')
         AND b.status IN ('approved', 'awaiting_payment', 'partially_paid', 'scheduled', 'paid')
         AND b.is_archived = false
       ORDER BY b.issue_date`,
      [args.vendorId, ...twBill.params, fromDate, toDate],
    );

    // Get payments from bill_payments (not payments_unified) to match Remix model
    // Filter by payment_date, apply tenant filter on both tables
    const twPay = tenantWhere(tenant, 2, "b");
    const paymentResult = await query(
      `SELECT
          bp.id,
          bp.amount,
          bp.currency,
          bp.payment_date,
          bp.payment_method,
          bp.payment_reference,
          bp.notes,
          b.bill_number
       FROM bill_payments bp
       JOIN bills b ON b.id = bp.bill_id
       WHERE b.vendor_id = $1
         AND ${twPay.sql}
         AND bp.payment_date >= $${twPay.nextParam}::timestamp
         AND bp.payment_date <= ($${twPay.nextParam + 1}::date + interval '1 day' - interval '1 millisecond')
         AND bp.status = 'completed'
         AND b.is_archived = false
       ORDER BY bp.payment_date`,
      [args.vendorId, ...twPay.params, fromDate, toDate],
    );

    // Build statement entries
    const bills = billResult.rows.map((r) => ({
      id: r.id,
      billNumber: r.bill_number,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      totalAmount: r.total_amount,
      status: r.status,
      currency: r.currency,
    }));

    const payments = paymentResult.rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      paymentDate: r.payment_date,
      paymentMethod: r.payment_method,
      referenceNumber: r.payment_reference,
      notes: r.notes,
      billNumber: r.bill_number,
    }));

    // Calculate summary totals
    let totalBilled = 0;
    let totalPaid = 0;

    for (const bill of bills) {
      totalBilled += parseFloat(bill.totalAmount as string);
    }
    for (const pay of payments) {
      totalPaid += parseFloat(pay.amount as string);
    }

    const closingBalance = openingBalance + totalBilled - totalPaid;

    return successResponse({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        paymentTerms: vendor.payment_terms,
      },
      fromDate,
      toDate,
      bills,
      payments,
      summary: {
        openingBalance: openingBalance.toFixed(2),
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        closingBalance: closingBalance.toFixed(2),
        billCount: bills.length,
        paymentCount: payments.length,
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
