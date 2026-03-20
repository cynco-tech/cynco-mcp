import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getAuditTrailSchema = {
  ...tenantSchema,
  entityType: z.string().optional().describe("Filter by entity type (e.g. invoice, journal_entry, bill)"),
  userId: z.string().optional().describe("Filter by user ID"),
  startDate: z.string().optional().describe("Start date (ISO 8601)"),
  endDate: z.string().optional().describe("End date (ISO 8601)"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getAuditTrail(args: {
  clientId?: string; accountingFirmId?: string;
  entityType?: string; userId?: string;
  startDate?: string; endDate?: string;
  limit?: number; offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "al");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";
    if (args.entityType) { filters += ` AND al.entity_type = $${nextParam}`; params.push(args.entityType); nextParam++; }
    if (args.userId) { filters += ` AND al.user_id = $${nextParam}`; params.push(args.userId); nextParam++; }
    if (args.startDate) { filters += ` AND al.created_at >= $${nextParam}`; params.push(args.startDate); nextParam++; }
    if (args.endDate) { filters += ` AND al.created_at <= $${nextParam}`; params.push(args.endDate); nextParam++; }

    const limit = args.limit ?? 50;
    params.push(limit + 1, args.offset ?? 0);

    const result = await query(
      `SELECT al.id, al.entity_type, al.entity_id, al.action, al.changes,
              al.user_id, u.email AS user_email, al.created_at
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE ${tw.sql} ${filters}
       ORDER BY al.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`, params);

    const hasMore = result.rows.length > limit;
    return successResponse({
      entries: result.rows.slice(0, limit).map(r => ({
        id: r.id, entityType: r.entity_type, entityId: r.entity_id,
        action: r.action, changes: r.changes,
        userId: r.user_id, userEmail: r.user_email, createdAt: r.created_at,
      })),
      entryCount: Math.min(result.rows.length, limit), hasMore,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
