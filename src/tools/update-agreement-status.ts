import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema, validateTransition } from "../utils/tools.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["internal_review", "sent"],
  internal_review: ["draft", "sent"],
  sent: ["negotiating", "signing", "voided"],
  negotiating: ["signing", "voided"],
  signing: ["partially_signed", "executed", "voided"],
  partially_signed: ["executed", "voided"],
  executed: ["active"],
  active: ["completed", "expired", "terminated"],
  completed: [], expired: [], terminated: [], voided: [],
};

export const updateAgreementStatusSchema = {
  ...tenantSchema,
  agreementId: z.string().describe("Agreement ID"),
  newStatus: z.enum(["internal_review", "sent", "negotiating", "signing", "partially_signed", "executed", "active", "completed", "expired", "terminated", "voided"]).describe("New status"),
};

export async function updateAgreementStatus(args: {
  clientId?: string; accountingFirmId?: string;
  agreementId: string; newStatus: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.agreementId, "agr", "agreementId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, agreement_number, status FROM agreements WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.agreementId, ...tw.params]);
      if (existing.rows.length === 0) return errorResponse("Agreement not found or does not belong to this tenant.");

      const currentStatus = existing.rows[0].status as string;
      const transitionError = validateTransition(VALID_TRANSITIONS, currentStatus, args.newStatus);
      if (transitionError) return errorResponse(transitionError);

      const updates: string[] = [`status = $1`, `updated_at = NOW()`];
      const params: unknown[] = [args.newStatus];
      if (args.newStatus === "executed") updates.push(`executed_at = NOW()`);
      if (args.newStatus === "terminated") updates.push(`terminated_at = NOW()`);

      params.push(args.agreementId);
      const updTw = tenantWhere(tenant, params.length + 1);
      await client.query(`UPDATE agreements SET ${updates.join(", ")} WHERE id = $${params.length} AND ${updTw.sql}`, [...params, ...updTw.params]);

      return successResponse({
        id: args.agreementId, agreementNumber: existing.rows[0].agreement_number,
        previousStatus: currentStatus, newStatus: args.newStatus,
      });
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
