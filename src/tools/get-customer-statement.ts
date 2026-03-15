import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getCustomerStatementSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  customerId: z.string().describe("Customer ID"),
  fromDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 12 months ago."),
  toDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
};

export async function getCustomerStatement(args: {
  clientId?: string;
  accountingFirmId?: string;
  customerId: string;
  fromDate?: string;
  toDate?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.customerId, "cust", "customerId");

    const today = new Date();
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const fromDate = args.fromDate ?? twelveMonthsAgo.toISOString().split("T")[0];
    const toDate = args.toDate ?? today.toISOString().split("T")[0];

    // Verify customer belongs to tenant
    const tw = tenantWhere(tenant, 2, "c");
    const custResult = await query(
      `SELECT c.id, c.name, c.email, c.payment_terms, c.credit_limit
       FROM customers c
       WHERE c.id = $1 AND ${tw.sql}`,
      [args.customerId, ...tw.params],
    );
    if (custResult.rows.length === 0) {
      return errorResponse("Customer not found or does not belong to this tenant.");
    }
    const customer = custResult.rows[0];

    // Get invoices in date range
    const twInv = tenantWhere(tenant, 3, "i");
    const invoiceResult = await query(
      `SELECT
          i.id,
          i.invoice_number,
          i.status,
          i.total_amount,
          i.paid_amount,
          i.currency,
          i.due_date,
          i.created_at
       FROM invoices i
       WHERE i.customer_id = $1
         AND ${twInv.sql}
         AND i.created_at >= $${twInv.nextParam}::timestamp
         AND i.created_at <= ($${twInv.nextParam + 1}::date + interval '1 day')
         AND i.status NOT IN ('draft', 'quotation')
         AND (i.is_archived = false OR i.is_archived IS NULL)
       ORDER BY i.created_at`,
      [args.customerId, ...twInv.params, fromDate, toDate],
    );

    // Get payments in date range
    const twPay = tenantWhere(tenant, 3, "ip");
    const paymentResult = await query(
      `SELECT
          ip.id,
          ip.invoice_id,
          ip.amount,
          ip.currency,
          ip.payment_method,
          ip.payment_date,
          ip.status,
          ip.payment_type
       FROM invoice_payments ip
       JOIN invoices i ON i.id = ip.invoice_id
       WHERE i.customer_id = $1
         AND ${twPay.sql}
         AND ip.created_at >= $${twPay.nextParam}::timestamp
         AND ip.created_at <= ($${twPay.nextParam + 1}::date + interval '1 day')
         AND ip.status = 'completed'
       ORDER BY ip.payment_date`,
      [args.customerId, ...twPay.params, fromDate, toDate],
    );

    // Get credit/debit notes in date range
    const twCdn = tenantWhere(tenant, 3, "cdn");
    const noteResult = await query(
      `SELECT
          cdn.id,
          cdn.note_type,
          cdn.note_number,
          cdn.original_invoice_id,
          cdn.total_amount,
          cdn.applied_amount,
          cdn.remaining_amount,
          cdn.status,
          cdn.reason,
          cdn.created_at
       FROM credit_debit_notes cdn
       WHERE cdn.customer_id = $1
         AND ${twCdn.sql}
         AND cdn.created_at >= $${twCdn.nextParam}::timestamp
         AND cdn.created_at <= ($${twCdn.nextParam + 1}::date + interval '1 day')
         AND cdn.status != 'voided'
       ORDER BY cdn.created_at`,
      [args.customerId, ...twCdn.params, fromDate, toDate],
    );

    // Build statement entries
    const invoices = invoiceResult.rows.map((r) => ({
      type: "invoice" as const,
      id: r.id,
      reference: r.invoice_number,
      date: r.created_at,
      dueDate: r.due_date,
      status: r.status,
      amount: r.total_amount,
      paidAmount: r.paid_amount,
      outstanding: (parseFloat(r.total_amount as string) - parseFloat((r.paid_amount ?? "0") as string)).toFixed(2),
      currency: r.currency,
    }));

    const payments = paymentResult.rows.map((r) => ({
      type: "payment" as const,
      id: r.id,
      invoiceId: r.invoice_id,
      date: r.payment_date,
      amount: r.amount,
      paymentMethod: r.payment_method,
      paymentType: r.payment_type,
      currency: r.currency,
    }));

    const notes = noteResult.rows.map((r) => ({
      type: r.note_type as string,
      id: r.id,
      reference: r.note_number,
      originalInvoiceId: r.original_invoice_id,
      date: r.created_at,
      totalAmount: r.total_amount,
      appliedAmount: r.applied_amount,
      remainingAmount: r.remaining_amount,
      status: r.status,
      reason: r.reason,
    }));

    // Calculate totals
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let totalCreditNotes = 0;
    let totalDebitNotes = 0;

    for (const inv of invoices) {
      totalInvoiced += parseFloat(inv.amount as string);
      totalOutstanding += parseFloat(inv.outstanding);
    }
    for (const pay of payments) {
      totalPaid += parseFloat(pay.amount as string);
    }
    for (const note of notes) {
      if (note.type === "credit") {
        totalCreditNotes += parseFloat(note.totalAmount as string);
      } else {
        totalDebitNotes += parseFloat(note.totalAmount as string);
      }
    }

    return successResponse({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        paymentTerms: customer.payment_terms,
        creditLimit: customer.credit_limit,
      },
      fromDate,
      toDate,
      invoices,
      payments,
      creditDebitNotes: notes,
      summary: {
        totalInvoiced: totalInvoiced.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        totalCreditNotes: totalCreditNotes.toFixed(2),
        totalDebitNotes: totalDebitNotes.toFixed(2),
        invoiceCount: invoices.length,
        paymentCount: payments.length,
        noteCount: notes.length,
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
