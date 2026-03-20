import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getAssetSummarySchema = {
  ...tenantSchema,
};

export async function getAssetSummary(args: {
  clientId?: string; accountingFirmId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "a");

    const result = await query(
      `SELECT
        c.name AS category_name,
        a.status,
        COUNT(*) AS count,
        COALESCE(SUM(a.total_cost), 0) AS total_cost,
        COALESCE(SUM(a.accumulated_depreciation), 0) AS total_depreciation,
        COALESCE(SUM(a.net_book_value), 0) AS total_nbv
       FROM fixed_assets a
       LEFT JOIN asset_categories c ON c.id = a.category_id
       WHERE ${tw.sql} AND a.is_archived = false
       GROUP BY c.name, a.status
       ORDER BY c.name, a.status`, tw.params);

    const totals = { assetCount: 0, totalCost: 0, totalDepreciation: 0, totalNBV: 0 };
    const summary = result.rows.map(r => {
      const count = parseInt(r.count as string, 10);
      totals.assetCount += count;
      totals.totalCost += parseFloat(r.total_cost as string);
      totals.totalDepreciation += parseFloat(r.total_depreciation as string);
      totals.totalNBV += parseFloat(r.total_nbv as string);
      return {
        categoryName: r.category_name ?? "Uncategorized", status: r.status,
        count, totalCost: r.total_cost, totalDepreciation: r.total_depreciation,
        totalNBV: r.total_nbv,
      };
    });

    return successResponse({ summary, totals });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
