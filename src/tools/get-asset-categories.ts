import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getAssetCategoriesSchema = {
  ...tenantSchema,
};

export async function getAssetCategories(args: {
  clientId?: string; accountingFirmId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "c");

    const result = await query(
      `SELECT c.id, c.name, c.code, c.description,
              c.depreciation_method, c.default_useful_life_years, c.default_residual_value_pct,
              c.ca_class, c.ia_rate, c.aa_rate, c.is_active,
              (SELECT COUNT(*) FROM fixed_assets a WHERE a.category_id = c.id AND a.is_archived = false) AS asset_count
       FROM asset_categories c WHERE ${tw.sql} AND c.is_active = true ORDER BY c.code`, tw.params);

    return successResponse({
      categories: result.rows.map(r => ({
        id: r.id, name: r.name, code: r.code, description: r.description,
        depreciationMethod: r.depreciation_method,
        defaultUsefulLifeYears: r.default_useful_life_years,
        defaultResidualValuePct: r.default_residual_value_pct,
        caClass: r.ca_class, iaRate: r.ia_rate, aaRate: r.aa_rate,
        assetCount: parseInt(r.asset_count as string, 10),
      })),
      categoryCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
