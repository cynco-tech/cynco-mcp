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
  draft: ["sent"],
  sent: ["viewed", "accepted", "rejected", "expired"],
  viewed: ["accepted", "rejected", "expired"],
  accepted: ["converted"],
  rejected: [],
  expired: [],
  converted: [],
};

export const updateQuotationStatusSchema = {
  ...tenantSchema,
  quotationId: z.string().describe("Quotation ID"),
  newStatus: z.enum(["sent", "viewed", "accepted", "rejected", "expired", "converted"]).describe("New status"),
};

export async function updateQuotationStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  quotationId: string;
  newStatus: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.quotationId, "quot", "quotationId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, quotation_number, status FROM quotations WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.quotationId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Quotation not found or does not belong to this tenant.");
      }

      const currentStatus = existing.rows[0].status as string;
      const transitionError = validateTransition(VALID_TRANSITIONS, currentStatus, args.newStatus);
      if (transitionError) return errorResponse(transitionError);

      const updates: string[] = [`status = $1`, `updated_at = NOW()`];
      const params: unknown[] = [args.newStatus];
      let paramIdx = 2;

      if (args.newStatus === "accepted") {
        updates.push(`accepted_at = NOW()`);
      }

      params.push(args.quotationId);
      const updTw = tenantWhere(tenant, paramIdx + 1);
      await client.query(
        `UPDATE quotations SET ${updates.join(", ")} WHERE id = $${paramIdx} AND ${updTw.sql}`,
        [...params, ...updTw.params],
      );

      return successResponse({
        id: args.quotationId,
        quotationNumber: existing.rows[0].quotation_number,
        previousStatus: currentStatus,
        newStatus: args.newStatus,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
