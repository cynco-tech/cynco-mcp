import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import {
  lineItemSchema,
  calculateLineItems,
  generateSequenceNumber,
  tenantSchema,
  type LineItem,
} from "../utils/tools.js";

export const createCreditDebitNoteSchema = {
  ...tenantSchema,
  noteType: z.enum(["credit", "debit"]).describe("Note type: credit (reduces amount owed) or debit (increases amount owed)"),
  originalInvoiceId: z.string().describe("Original invoice ID this note relates to"),
  lineItems: z.array(lineItemSchema).min(1).describe("Note line items"),
  reason: z.string().min(1).describe("Reason for the note"),
  reasonCategory: z.enum([
    "goods_returned", "billing_error", "discount_adjustment", "service_not_delivered",
    "additional_charges", "late_payment_interest", "price_adjustment", "other",
  ]).describe("Reason category"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createCreditDebitNote(args: {
  clientId?: string;
  accountingFirmId?: string;
  noteType: string;
  originalInvoiceId: string;
  lineItems: LineItem[];
  reason: string;
  reasonCategory: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.originalInvoiceId, "inv", "originalInvoiceId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify invoice exists and belongs to tenant
      const invTw = tenantWhere(tenant, 2);
      const invResult = await client.query(
        `SELECT id, invoice_number, customer_id, customer_name, customer_email, currency
         FROM invoices WHERE id = $1 AND ${invTw.sql}`,
        [args.originalInvoiceId, ...invTw.params],
      );
      if (invResult.rows.length === 0) {
        return errorResponse("Invoice not found or does not belong to this tenant.");
      }
      const invoice = invResult.rows[0];

      const { items: calculatedItems, subtotal, totalTax: taxAmount, totalAmount } = calculateLineItems(args.lineItems);

      // Generate note number
      const prefix = args.noteType === "credit" ? "CN" : "DN";
      const noteNumber = await generateSequenceNumber(client, tenant, "credit_debit_notes", "note_number", prefix, "cdn-number");

      const noteId = generateId("cdn");
      await client.query(
        `INSERT INTO credit_debit_notes (
          id, note_type, original_invoice_id, note_number,
          customer_name, customer_email, customer_id, user_id,
          client_id, accounting_firm_id,
          currency, subtotal, tax_amount, total_amount,
          applied_amount, remaining_amount, paid_amount,
          line_items, reason, reason_category, status,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13, $14,
          0, $15, 0,
          $16, $17, $18, 'draft',
          NOW(), NOW()
        )`,
        [
          noteId, args.noteType, args.originalInvoiceId, noteNumber,
          invoice.customer_name, invoice.customer_email, invoice.customer_id, args.createdBy,
          tenant.clientId, tenant.accountingFirmId,
          invoice.currency, subtotal.toFixed(2), taxAmount.toFixed(2), totalAmount.toFixed(2),
          args.noteType === "credit" ? totalAmount.toFixed(2) : null,
          JSON.stringify(calculatedItems), args.reason, args.reasonCategory,
        ],
      );

      return successResponse({
        id: noteId,
        noteNumber,
        noteType: args.noteType,
        status: "draft",
        originalInvoiceNumber: invoice.invoice_number,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
