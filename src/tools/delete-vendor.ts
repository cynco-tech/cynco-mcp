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

export const deleteVendorSchema = {
  ...tenantSchema,
  vendorId: z.string().describe("Vendor ID to deactivate"),
};

export async function deleteVendor(args: {
  clientId?: string;
  accountingFirmId?: string;
  vendorId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.vendorId, "vend", "vendorId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, name, is_active FROM vendors WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.vendorId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Vendor not found or does not belong to this tenant.");
      }
      if (!existing.rows[0].is_active) {
        return errorResponse("Vendor is already inactive.");
      }

      const billTw = tenantWhere(tenant, 2);
      const billCheck = await client.query(
        `SELECT COUNT(*) as cnt FROM bills
         WHERE vendor_id = $1 AND ${billTw.sql}
           AND status IN ('awaiting_payment', 'partially_paid', 'overdue', 'approved')
           AND is_archived = false`,
        [args.vendorId, ...billTw.params],
      );
      const outstanding = parseInt(billCheck.rows[0].cnt as string, 10);
      if (outstanding > 0) {
        return errorResponse(
          `Cannot deactivate: vendor has ${outstanding} outstanding bill(s). Resolve them first.`,
        );
      }

      const updTw = tenantWhere(tenant, 2);
      await client.query(
        `UPDATE vendors SET is_active = false, updated_at = NOW() WHERE id = $1 AND ${updTw.sql}`,
        [args.vendorId, ...updTw.params],
      );

      return successResponse({
        id: args.vendorId,
        name: existing.rows[0].name,
        isActive: false,
        deactivatedAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
