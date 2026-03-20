import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getAssetDetailSchema = {
  ...tenantSchema,
  assetId: z.string().describe("Fixed asset ID"),
};

export async function getAssetDetail(args: {
  clientId?: string; accountingFirmId?: string; assetId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.assetId, "ast", "assetId");
    const tw = tenantWhere(tenant, 2, "a");

    const result = await query(
      `SELECT a.*, c.name AS category_name, v.name AS supplier_name,
              (SELECT json_agg(json_build_object(
                'id', d.id, 'period', d.period, 'amount', d.depreciation_amount,
                'accumulatedToDate', d.accumulated_to_date, 'nbvAfter', d.net_book_value_after,
                'isPosted', d.is_posted
              ) ORDER BY d.period DESC)
              FROM depreciation_schedules d WHERE d.asset_id = a.id) AS depreciation,
              (SELECT json_agg(json_build_object(
                'id', cr.id, 'yoa', cr.year_of_assessment,
                'ia', cr.initial_allowance, 'aa', cr.annual_allowance,
                'totalClaimed', cr.total_ca_claimed, 'residual', cr.residual_expenditure
              ) ORDER BY cr.year_of_assessment DESC)
              FROM capital_allowance_records cr WHERE cr.asset_id = a.id) AS capitalAllowances
       FROM fixed_assets a
       LEFT JOIN asset_categories c ON c.id = a.category_id
       LEFT JOIN vendors v ON v.id = a.supplier_id
       WHERE a.id = $1 AND ${tw.sql}`,
      [args.assetId, ...tw.params]);

    if (result.rows.length === 0) return errorResponse("Asset not found or does not belong to this tenant.");
    const r = result.rows[0];

    return successResponse({
      id: r.id, assetCode: r.asset_code, name: r.name, description: r.description,
      status: r.status, categoryName: r.category_name, serialNumber: r.serial_number,
      location: r.location, department: r.department, custodian: r.custodian,
      purchaseDate: r.purchase_date, purchaseCost: r.purchase_cost,
      additionalCosts: r.additional_costs, totalCost: r.total_cost,
      depreciationMethod: r.depreciation_method, usefulLifeMonths: r.useful_life_months,
      residualValue: r.residual_value, accumulatedDepreciation: r.accumulated_depreciation,
      netBookValue: r.net_book_value, supplierName: r.supplier_name,
      caClass: r.ca_class, iaRate: r.ia_rate, aaRate: r.aa_rate,
      depreciation: r.depreciation ?? [], capitalAllowances: r.capitalallowances ?? [],
      createdAt: r.created_at,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
