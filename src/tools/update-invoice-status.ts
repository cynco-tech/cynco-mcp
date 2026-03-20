import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["finalized", "void"],
  finalized: ["paid", "partially_paid", "overdue", "void"],
  partially_paid: ["paid", "void"],
  overdue: ["paid", "partially_paid", "void"],
  deposit_paid: ["paid", "partially_paid", "void"],
  deposit_due: ["finalized", "void"],
};

export const updateInvoiceStatusSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  invoiceId: z.string().describe("Invoice ID to update"),
  status: z
    .enum(["finalized", "paid", "partially_paid", "overdue", "void"])
    .describe("Target status"),
  updatedBy: z.string().describe("User ID performing the change"),
};

export async function updateInvoiceStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  invoiceId: string;
  status: "finalized" | "paid" | "partially_paid" | "overdue" | "void";
  updatedBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.invoiceId, "inv", "invoiceId");
    validateTypeId(args.updatedBy, "usr", "updatedBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.updatedBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(
          `User not found: ${args.updatedBy}. updatedBy must reference a valid user ID.`,
        );
      }

      // Fetch and lock current invoice with tenant scope (FOR UPDATE prevents concurrent status changes)
      const tw = tenantWhere(tenant, 2);
      const invResult = await client.query(
        `SELECT id, status, invoice_number, total_amount, customer_name
         FROM invoices
         WHERE id = $1 AND ${tw.sql} AND is_archived = false
         FOR UPDATE`,
        [args.invoiceId, ...tw.params],
      );

      if (invResult.rows.length === 0) {
        return errorResponse(
          "Invoice not found, archived, or does not belong to this tenant.",
        );
      }

      const invoice = invResult.rows[0];
      const currentStatus = invoice.status as string;
      const invoiceNumber = invoice.invoice_number as string;

      // Validate transition
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(args.status)) {
        return errorResponse(
          `Invalid status transition: ${currentStatus} → ${args.status}. ` +
            `Allowed transitions from "${currentStatus}": ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}.`,
        );
      }

      // Update the invoice status (tenant filter for defense-in-depth)
      const updTw = tenantWhere(tenant, 3);
      await client.query(
        `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND ${updTw.sql}`,
        [args.status, args.invoiceId, ...updTw.params],
      );

      return successResponse({
        invoiceId: args.invoiceId,
        invoiceNumber,
        customerName: invoice.customer_name,
        totalAmount: invoice.total_amount,
        previousStatus: currentStatus,
        newStatus: args.status,
        updatedBy: args.updatedBy,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
