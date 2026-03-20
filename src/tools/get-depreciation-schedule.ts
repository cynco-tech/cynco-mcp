import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getDepreciationScheduleSchema = {
  ...tenantSchema,
  assetId: z.string().optional().describe("Filter by asset ID"),
  period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Filter by period (YYYY-MM)"),
};

export async function getDepreciationSchedule(args: {
  clientId?: string; accountingFirmId?: string; assetId?: string; period?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    if (args.assetId) validateTypeId(args.assetId, "ast", "assetId");
    const tw = tenantWhere(tenant, 1, "a");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";
    if (args.assetId) { filters += ` AND d.asset_id = $${nextParam}`; params.push(args.assetId); nextParam++; }
    if (args.period) { filters += ` AND d.period = $${nextParam}`; params.push(args.period); nextParam++; }

    const result = await query(
      `SELECT d.id, d.asset_id, d.period, d.depreciation_amount,
              d.accumulated_to_date, d.net_book_value_after, d.is_posted,
              a.asset_code, a.name AS asset_name
       FROM depreciation_schedules d
       JOIN fixed_assets a ON a.id = d.asset_id
       WHERE ${tw.sql} ${filters}
       ORDER BY d.period DESC, a.asset_code`, params);

    return successResponse({
      schedules: result.rows.map(r => ({
        id: r.id, assetId: r.asset_id, assetCode: r.asset_code, assetName: r.asset_name,
        period: r.period, depreciationAmount: r.depreciation_amount,
        accumulatedToDate: r.accumulated_to_date, netBookValueAfter: r.net_book_value_after,
        isPosted: r.is_posted,
      })),
      scheduleCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
