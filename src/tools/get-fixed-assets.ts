import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getFixedAssetsSchema = {
  ...tenantSchema,
  status: z.string().optional().describe("Filter by status (draft, active, disposed, held_for_sale, fully_depreciated)"),
  categoryId: z.string().optional().describe("Filter by asset category ID"),
  search: z.string().max(200).optional().describe("Search by name, code, or serial number"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getFixedAssets(args: {
  clientId?: string; accountingFirmId?: string;
  status?: string; categoryId?: string; search?: string;
  limit?: number; offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "a");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = ` AND a.is_archived = false`;
    if (args.status) { filters += ` AND a.status = $${nextParam}`; params.push(args.status); nextParam++; }
    if (args.categoryId) { filters += ` AND a.category_id = $${nextParam}`; params.push(args.categoryId); nextParam++; }
    if (args.search) {
      filters += ` AND (LOWER(a.name) LIKE $${nextParam} OR LOWER(COALESCE(a.asset_code,'')) LIKE $${nextParam} OR LOWER(COALESCE(a.serial_number,'')) LIKE $${nextParam})`;
      params.push(`%${args.search.toLowerCase()}%`); nextParam++;
    }

    const limit = args.limit ?? 50;
    params.push(limit + 1, args.offset ?? 0);

    const result = await query(
      `SELECT a.id, a.asset_code, a.name, a.status, a.purchase_date, a.total_cost,
              a.depreciation_method, a.useful_life_months, a.accumulated_depreciation,
              a.net_book_value, a.location, a.department, a.serial_number,
              c.name AS category_name, a.created_at
       FROM fixed_assets a
       LEFT JOIN asset_categories c ON c.id = a.category_id
       WHERE ${tw.sql} ${filters}
       ORDER BY a.asset_code
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`, params);

    const hasMore = result.rows.length > limit;
    return successResponse({
      assets: result.rows.slice(0, limit).map(r => ({
        id: r.id, assetCode: r.asset_code, name: r.name, status: r.status,
        purchaseDate: r.purchase_date, totalCost: r.total_cost,
        depreciationMethod: r.depreciation_method, usefulLifeMonths: r.useful_life_months,
        accumulatedDepreciation: r.accumulated_depreciation, netBookValue: r.net_book_value,
        location: r.location, department: r.department, serialNumber: r.serial_number,
        categoryName: r.category_name, createdAt: r.created_at,
      })),
      assetCount: Math.min(result.rows.length, limit), hasMore,
      nextOffset: hasMore ? (args.offset ?? 0) + limit : null,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
