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
import { tenantSchema, validateTransition } from "../utils/tools.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "approved", "void"],
  pending_approval: ["approved", "rejected", "void"],
  approved: ["partially_received", "received", "closed", "void"],
  partially_received: ["received", "closed", "void"],
  received: ["closed"],
  rejected: [],
  closed: [],
  void: [],
};

export const updatePurchaseOrderStatusSchema = {
  ...tenantSchema,
  purchaseOrderId: z.string().describe("Purchase order ID"),
  newStatus: z.enum(["pending_approval", "approved", "partially_received", "received", "closed", "rejected", "void"]).describe("New status"),
};

export async function updatePurchaseOrderStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  purchaseOrderId: string;
  newStatus: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.purchaseOrderId, "po", "purchaseOrderId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, po_number, status FROM purchase_orders WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.purchaseOrderId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Purchase order not found or does not belong to this tenant.");
      }

      const currentStatus = existing.rows[0].status as string;
      const transitionError = validateTransition(VALID_TRANSITIONS, currentStatus, args.newStatus);
      if (transitionError) return errorResponse(transitionError);

      const twUpdate = tenantWhere(tenant, 3);
      await client.query(
        `UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND ${twUpdate.sql}`,
        [args.newStatus, args.purchaseOrderId, ...twUpdate.params],
      );

      return successResponse({
        id: args.purchaseOrderId,
        poNumber: existing.rows[0].po_number,
        previousStatus: currentStatus,
        newStatus: args.newStatus,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
