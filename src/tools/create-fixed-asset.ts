import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const createFixedAssetSchema = {
  ...tenantSchema,
  name: z.string().min(1).max(255).describe("Asset name"),
  categoryId: z.string().describe("Asset category ID"),
  purchaseDate: z.string().describe("Purchase date (YYYY-MM-DD)"),
  purchaseCost: z.number().min(0).describe("Purchase cost"),
  additionalCosts: z.number().min(0).optional().describe("Additional costs (installation, etc.)"),
  depreciationMethod: z.enum(["straight_line", "reducing_balance", "units_of_production"]).describe("Depreciation method"),
  usefulLifeMonths: z.number().int().min(1).describe("Useful life in months"),
  residualValue: z.number().min(0).optional().describe("Residual/salvage value"),
  serialNumber: z.string().max(100).optional().describe("Serial number"),
  location: z.string().max(255).optional().describe("Physical location"),
  department: z.string().max(100).optional().describe("Department"),
  description: z.string().optional().describe("Asset description"),
  createdBy: z.string().describe("User ID"),
};

export async function createFixedAsset(args: {
  clientId?: string; accountingFirmId?: string;
  name: string; categoryId: string; purchaseDate: string;
  purchaseCost: number; additionalCosts?: number;
  depreciationMethod: string; usefulLifeMonths: number;
  residualValue?: number; serialNumber?: string;
  location?: string; department?: string; description?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.categoryId, "asc", "categoryId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Generate asset code
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || '-asset-code'))`, [tenant.value]);
      const tw = tenantWhere(tenant, 1);
      const maxResult = await client.query(
        `SELECT MAX(asset_code) as max_code FROM fixed_assets WHERE ${tw.sql} AND asset_code LIKE 'AST-%'`,
        tw.params);
      let nextSeq = 1;
      if (maxResult.rows[0]?.max_code) {
        const parsed = parseInt((maxResult.rows[0].max_code as string).replace("AST-", ""), 10);
        if (!isNaN(parsed)) nextSeq = parsed + 1;
      }
      const assetCode = `AST-${String(nextSeq).padStart(5, "0")}`;
      const assetId = generateId("ast");
      const totalCost = args.purchaseCost + (args.additionalCosts ?? 0);

      await client.query(
        `INSERT INTO fixed_assets (
          id, client_id, accounting_firm_id, asset_code, name, description,
          category_id, serial_number, location, department,
          purchase_date, purchase_cost, additional_costs, total_cost,
          depreciation_method, useful_life_months, residual_value,
          accumulated_depreciation, net_book_value, depreciation_start_date,
          status, source_type, is_archived, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17,
          0, $14, $11,
          'draft', 'manual', false, $18, NOW(), NOW()
        )`,
        [
          assetId, tenant.clientId, tenant.accountingFirmId, assetCode, args.name, args.description ?? null,
          args.categoryId, args.serialNumber ?? null, args.location ?? null, args.department ?? null,
          args.purchaseDate, args.purchaseCost, args.additionalCosts ?? 0, totalCost,
          args.depreciationMethod, args.usefulLifeMonths, args.residualValue ?? 0,
          args.createdBy,
        ]);

      return successResponse({
        id: assetId, assetCode, name: args.name, status: "draft",
        totalCost, netBookValue: totalCost,
      });
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
