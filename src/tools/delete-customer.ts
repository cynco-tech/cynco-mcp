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
import { tenantSchema } from "../utils/tools.js";

export const deleteCustomerSchema = {
  ...tenantSchema,
  customerId: z.string().describe("Customer ID to deactivate"),
};

export async function deleteCustomer(args: {
  clientId?: string;
  accountingFirmId?: string;
  customerId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.customerId, "cust", "customerId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, name, is_active FROM customers WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.customerId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Customer not found or does not belong to this tenant.");
      }
      if (!existing.rows[0].is_active) {
        return errorResponse("Customer is already inactive.");
      }

      // Check for outstanding invoices
      const invTw = tenantWhere(tenant, 2);
      const invoiceCheck = await client.query(
        `SELECT COUNT(*) as cnt FROM invoices
         WHERE customer_id = $1 AND ${invTw.sql}
           AND status IN ('finalized', 'partially_paid', 'overdue', 'awaiting_payment')
           AND (is_archived = false OR is_archived IS NULL)`,
        [args.customerId, ...invTw.params],
      );
      const outstanding = parseInt(invoiceCheck.rows[0].cnt as string, 10);
      if (outstanding > 0) {
        return errorResponse(
          `Cannot deactivate: customer has ${outstanding} outstanding invoice(s). Resolve them first.`,
        );
      }

      const updTw = tenantWhere(tenant, 2);
      await client.query(
        `UPDATE customers SET is_active = false, updated_at = NOW() WHERE id = $1 AND ${updTw.sql}`,
        [args.customerId, ...updTw.params],
      );

      return successResponse({
        id: args.customerId,
        name: existing.rows[0].name,
        isActive: false,
        deactivatedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
