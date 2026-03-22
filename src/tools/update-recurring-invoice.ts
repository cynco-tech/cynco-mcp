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
import { tenantSchema, buildUpdateSet } from "../utils/tools.js";

export const updateRecurringInvoiceSchema = {
  ...tenantSchema,
  templateId: z.string().describe("Recurring invoice template ID"),
  status: z.enum(["active", "paused", "cancelled"]).optional().describe("Template status"),
  endDate: z.string().optional().describe("End date (ISO 8601)"),
  paymentTerms: z.string().max(100).optional().describe("Payment terms"),
  memo: z.string().max(500).optional().describe("Internal memo"),
  autoSend: z.boolean().optional().describe("Auto-send generated invoices"),
  autoFinalize: z.boolean().optional().describe("Auto-finalize generated invoices"),
};

export async function updateRecurringInvoice(args: {
  clientId?: string;
  accountingFirmId?: string;
  templateId: string;
  status?: string;
  endDate?: string;
  paymentTerms?: string;
  memo?: string;
  autoSend?: boolean;
  autoFinalize?: boolean;
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

      const upd = buildUpdateSet();

      upd.add("status", args.status);
      upd.add("end_date", args.endDate);
      upd.add("payment_terms", args.paymentTerms);
      upd.add("memo", args.memo);
      upd.add("auto_send", args.autoSend);
      upd.add("auto_finalize", args.autoFinalize);

      if (upd.fields.length === 0) return errorResponse("No fields to update.");

      upd.fields.push(`updated_at = NOW()`);
      upd.values.push(args.templateId);
      const updTw = tenantWhere(tenant, upd.paramIdx + 1);
      await client.query(
        `UPDATE recurring_invoice_templates SET ${upd.fields.join(", ")} WHERE id = $${upd.paramIdx} AND ${updTw.sql}`,
        [...upd.values, ...updTw.params],
      );

      return successResponse({
        id: args.templateId,
        previousStatus: existing.rows[0].status,
        status: args.status ?? existing.rows[0].status,
        customerName: existing.rows[0].customer_name,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
