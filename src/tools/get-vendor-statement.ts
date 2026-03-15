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

    // Get bills in date range
    const twBill = tenantWhere(tenant, 2, "b");
    const billResult = await query(
      `SELECT
          b.id,
          b.bill_number,
          b.status,
          b.issue_date,
          b.due_date,
          b.total_amount,
          b.currency,
          COALESCE(bp_sum.paid, 0) AS paid_amount
       FROM bills b
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS paid
         FROM bill_payments WHERE bill_id = b.id AND status = 'completed'
       ) bp_sum ON true
       WHERE b.vendor_id = $1
         AND ${twBill.sql}
         AND b.created_at >= $${twBill.nextParam}::timestamp
         AND b.created_at <= ($${twBill.nextParam + 1}::date + interval '1 day')
         AND b.status NOT IN ('draft', 'void')
         AND b.is_archived = false
       ORDER BY b.created_at`,
      [args.vendorId, ...twBill.params, fromDate, toDate],
    );

    // Get payments from payments_unified for this vendor
    const twPay = tenantWhere(tenant, 2, "pu");
    const paymentResult = await query(
      `SELECT
          pu.id,
          pu.amount,
          pu.currency,
          pu.payment_date,
          pu.payment_method,
          pu.reference_number,
          pu.description,
          pu.status,
          pu.bill_id
       FROM payments_unified pu
       WHERE pu.entity_id = $1
         AND pu.entity_type = 'vendor'
         AND pu.direction = 'outbound'
         AND ${twPay.sql}
         AND pu.payment_date >= $${twPay.nextParam}::timestamp
         AND pu.payment_date <= ($${twPay.nextParam + 1}::date + interval '1 day')
         AND pu.status = 'completed'
       ORDER BY pu.payment_date`,
      [args.vendorId, ...twPay.params, fromDate, toDate],
    );

    // Build statement entries
    const bills = billResult.rows.map((r) => ({
      id: r.id,
      billNumber: r.bill_number,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      totalAmount: r.total_amount,
      paidAmount: r.paid_amount,
      outstanding: (parseFloat(r.total_amount as string) - parseFloat((r.paid_amount ?? "0") as string)).toFixed(2),
      status: r.status,
      currency: r.currency,
    }));

    const payments = paymentResult.rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      currency: r.currency,
      paymentDate: r.payment_date,
      paymentMethod: r.payment_method,
      referenceNumber: r.reference_number,
      description: r.description,
      billId: r.bill_id,
    }));

    // Calculate summary totals
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;

    for (const bill of bills) {
      totalBilled += parseFloat(bill.totalAmount as string);
      totalOutstanding += parseFloat(bill.outstanding);
    }
    for (const pay of payments) {
      totalPaid += parseFloat(pay.amount as string);
    }

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
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
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
