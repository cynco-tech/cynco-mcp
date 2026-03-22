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
  draft: ["in_review", "pending_approval", "approved", "void"],
  in_review: ["pending_approval", "approved", "rejected", "void"],
  pending_approval: ["approved", "rejected", "void"],
  approved: ["awaiting_payment", "void"],
  awaiting_payment: ["partially_paid", "paid", "void"],
  partially_paid: ["paid", "void"],
  rejected: ["draft"],
  scheduled: ["paid", "void"],
  paid: [],
  void: [],
};

export const updateBillStatusSchema = {
  ...tenantSchema,
  billId: z.string().describe("Bill ID"),
  newStatus: z.enum(["in_review", "pending_approval", "approved", "awaiting_payment", "partially_paid", "paid", "rejected", "void"]).describe("New status"),
};

export async function updateBillStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  billId: string;
  newStatus: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.billId, "bil", "billId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, bill_number, status FROM bills WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.billId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Bill not found or does not belong to this tenant.");
      }

      const currentStatus = existing.rows[0].status as string;
      const transitionError = validateTransition(VALID_TRANSITIONS, currentStatus, args.newStatus);
      if (transitionError) return errorResponse(transitionError);

      const updates: string[] = [`status = $1`, `updated_at = NOW()`];
      const params: unknown[] = [args.newStatus];

      if (args.newStatus === "paid") {
        updates.push(`paid_date = NOW()`);
      }

      params.push(args.billId);
      const updTw = tenantWhere(tenant, params.length + 1);
      await client.query(
        `UPDATE bills SET ${updates.join(", ")} WHERE id = $${params.length} AND ${updTw.sql}`,
        [...params, ...updTw.params],
      );

      return successResponse({
        id: args.billId,
        billNumber: existing.rows[0].bill_number,
        previousStatus: currentStatus,
        newStatus: args.newStatus,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
