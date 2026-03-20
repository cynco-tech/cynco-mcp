import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getEntityHistorySchema = {
  ...tenantSchema,
  entityId: z.string().describe("Entity ID to get history for"),
  entityType: z.string().describe("Entity type (e.g. invoice, bill, journal_entry, customer, vendor)"),
};

export async function getEntityHistory(args: {
  clientId?: string; accountingFirmId?: string;
  entityId: string; entityType: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 3, "al");

    const result = await query(
      `SELECT al.id, al.action, al.changes, al.user_id, u.email AS user_email, al.created_at
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.entity_id = $1 AND al.entity_type = $2 AND ${tw.sql}
       ORDER BY al.created_at DESC`,
      [args.entityId, args.entityType, ...tw.params]);

    return successResponse({
      entityId: args.entityId, entityType: args.entityType,
      history: result.rows.map(r => ({
        id: r.id, action: r.action, changes: r.changes,
        userId: r.user_id, userEmail: r.user_email, createdAt: r.created_at,
      })),
      historyCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
