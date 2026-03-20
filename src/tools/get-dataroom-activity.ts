import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getDataroomActivitySchema = {
  ...tenantSchema,
  resourceId: z.string().optional().describe("Filter by resource (file/folder) ID"),
  actionType: z.string().optional().describe("Filter by action type (e.g. upload_file, download_file)"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getDataroomActivity(args: {
  clientId?: string; accountingFirmId?: string;
  resourceId?: string; actionType?: string; limit?: number; offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "a");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";
    if (args.resourceId) { filters += ` AND a.resource_id = $${nextParam}`; params.push(args.resourceId); nextParam++; }
    if (args.actionType) { filters += ` AND a.action_type = $${nextParam}`; params.push(args.actionType); nextParam++; }

    const limit = args.limit ?? 50;
    params.push(limit, args.offset ?? 0);

    const result = await query(
      `SELECT a.id, a.user_id, a.action_type, a.resource_type, a.resource_id,
              a.details, a.created_at,
              u.email AS user_email
       FROM dataroom_activity a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${tw.sql} ${filters}
       ORDER BY a.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`, params);

    return successResponse({
      activities: result.rows.map(r => ({
        id: r.id, userId: r.user_id, userEmail: r.user_email,
        actionType: r.action_type, resourceType: r.resource_type, resourceId: r.resource_id,
        details: r.details, createdAt: r.created_at,
      })),
      activityCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
