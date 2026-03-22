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

export const deleteRecurringInvoiceSchema = {
  ...tenantSchema,
  templateId: z.string().describe("Recurring invoice template ID to cancel"),
};

export async function deleteRecurringInvoice(args: {
  clientId?: string;
  accountingFirmId?: string;
  templateId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.templateId, "ritpl", "templateId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, status, customer_name FROM recurring_invoice_templates WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.templateId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Recurring invoice template not found or does not belong to this tenant.");
      }
      if (existing.rows[0].status === "cancelled") {
        return errorResponse("Template is already cancelled.");
      }

      const updTw = tenantWhere(tenant, 2);
      await client.query(
        `UPDATE recurring_invoice_templates SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND ${updTw.sql}`,
        [args.templateId, ...updTw.params],
      );

      return successResponse({
        id: args.templateId,
        customerName: existing.rows[0].customer_name,
        previousStatus: existing.rows[0].status,
        status: "cancelled",
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
