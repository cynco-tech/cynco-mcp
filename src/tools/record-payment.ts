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

export const recordPaymentSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  entityId: z.string().describe("Customer or vendor ID (cust_... or vend_...)"),
  entityType: z.enum(["customer", "vendor"]).describe("Whether this payment is for a customer or vendor"),
  amount: z.number().positive().describe("Payment amount (positive number)"),
  paymentDate: z.string().describe("Payment date (YYYY-MM-DD)"),
  paymentMethod: z.string().optional().describe("Payment method (e.g. bank_transfer, cash, cheque, card)"),
  referenceNumber: z.string().optional().describe("Payment reference number"),
  description: z.string().optional().describe("Payment description"),
  notes: z.string().optional().describe("Additional notes"),
  invoiceId: z.string().optional().describe("Link to invoice (for customer payments)"),
  billId: z.string().optional().describe("Link to bill (for vendor payments)"),
  currency: z.string().optional().default("MYR").describe("Currency code (default MYR)"),
  createdBy: z.string().describe("User ID of the person recording the payment"),
};

export async function recordPayment(args: {
  clientId?: string;
  accountingFirmId?: string;
  entityId: string;
  entityType: "customer" | "vendor";
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  referenceNumber?: string;
  description?: string;
  notes?: string;
  invoiceId?: string;
  billId?: string;
  currency?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    // Validate entityId prefix matches entityType
    if (args.entityType === "customer") {
      validateTypeId(args.entityId, "cust", "entityId");
    } else {
      validateTypeId(args.entityId, "vend", "entityId");
    }

    // Determine direction from entityType
    const direction = args.entityType === "customer" ? "inbound" : "outbound";

    // Validate linked document IDs if provided
    if (args.invoiceId) {
      validateTypeId(args.invoiceId, "inv", "invoiceId");
    }
    if (args.billId) {
      validateTypeId(args.billId, "bil", "billId");
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify entity belongs to tenant
      const entityTable = args.entityType === "customer" ? "customers" : "vendors";
      const entityWhere = tenantWhere(tenant, 2);
      const entityResult = await client.query(
        `SELECT id FROM ${entityTable}
         WHERE id = $1 AND ${entityWhere.sql} AND is_active = true`,
        [args.entityId, ...entityWhere.params],
      );
      if (entityResult.rows.length === 0) {
        return errorResponse(
          `${args.entityType === "customer" ? "Customer" : "Vendor"} not found or does not belong to this tenant.`,
        );
      }

      // If invoiceId provided, verify it belongs to tenant and the customer matches
      if (args.invoiceId) {
        const invWhere = tenantWhere(tenant, 2);
        const invResult = await client.query(
          `SELECT id, customer_id, total_amount, paid_amount, status
           FROM invoices
           WHERE id = $1 AND ${invWhere.sql}`,
          [args.invoiceId, ...invWhere.params],
        );
        if (invResult.rows.length === 0) {
          return errorResponse(
            "Invoice not found or does not belong to this tenant.",
          );
        }
        if (args.entityType === "customer" && invResult.rows[0].customer_id !== args.entityId) {
          return errorResponse(
            "Invoice does not belong to the specified customer.",
          );
        }
      }

      // If billId provided, verify it belongs to tenant and the vendor matches
      if (args.billId) {
        const billWhere = tenantWhere(tenant, 2);
        const billResult = await client.query(
          `SELECT id, vendor_id, total_amount, status
           FROM bills
           WHERE id = $1 AND ${billWhere.sql}`,
          [args.billId, ...billWhere.params],
        );
        if (billResult.rows.length === 0) {
          return errorResponse(
            "Bill not found or does not belong to this tenant.",
          );
        }
        if (args.entityType === "vendor" && billResult.rows[0].vendor_id !== args.entityId) {
          return errorResponse(
            "Bill does not belong to the specified vendor.",
          );
        }
      }

      // INSERT payment
      const id = generateId("pmt");
      const currency = args.currency ?? "MYR";

      await client.query(
        `INSERT INTO payments_unified (
          id, entity_id, entity_type, direction, amount, currency,
          payment_date, payment_method, reference_number,
          description, notes, invoice_id, bill_id,
          status, is_reconciled,
          client_id, accounting_firm_id, created_by,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15,
          $16, $17, $18,
          NOW(), NOW()
        )`,
        [
          id,
          args.entityId,
          args.entityType,
          direction,
          args.amount,
          currency,
          args.paymentDate,
          args.paymentMethod ?? null,
          args.referenceNumber ?? null,
          args.description ?? null,
          args.notes ?? null,
          args.invoiceId ?? null,
          args.billId ?? null,
          "completed",
          false,
          tenant.clientId,
          tenant.accountingFirmId,
          args.createdBy,
        ],
      );

      // If invoiceId: update invoice paidAmount and potentially change status
      if (args.invoiceId) {
        const invWhere = tenantWhere(tenant, 2);
        const invRow = await client.query(
          `SELECT total_amount, paid_amount
           FROM invoices
           WHERE id = $1 AND ${invWhere.sql}`,
          [args.invoiceId, ...invWhere.params],
        );

        if (invRow.rows.length > 0) {
          const totalAmount = parseFloat(invRow.rows[0].total_amount as string);
          const currentPaid = parseFloat((invRow.rows[0].paid_amount ?? "0") as string);
          const newPaid = currentPaid + args.amount;

          let newStatus: string;
          if (newPaid >= totalAmount) {
            newStatus = "paid";
          } else {
            newStatus = "partially_paid";
          }

          await client.query(
            `UPDATE invoices
             SET paid_amount = $1, status = $2, updated_at = NOW()
             WHERE id = $3`,
            [newPaid, newStatus, args.invoiceId],
          );
        }
      }

      return successResponse({
        id,
        entityId: args.entityId,
        entityType: args.entityType,
        direction,
        amount: args.amount,
        currency,
        paymentDate: args.paymentDate,
        status: "completed",
        invoiceId: args.invoiceId ?? null,
        billId: args.billId ?? null,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
