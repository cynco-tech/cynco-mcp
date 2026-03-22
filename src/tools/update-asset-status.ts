import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema, validateTransition } from "../utils/tools.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active"],
  active: ["disposed", "held_for_sale", "fully_depreciated"],
  held_for_sale: ["active", "disposed"],
  fully_depreciated: ["disposed"],
  disposed: [],
};

export const updateAssetStatusSchema = {
  ...tenantSchema,
  assetId: z.string().describe("Fixed asset ID"),
  newStatus: z.enum(["active", "disposed", "held_for_sale", "fully_depreciated"]).describe("New status"),
  disposalDate: z.string().optional().describe("Disposal date (for disposal, YYYY-MM-DD)"),
  disposalProceeds: z.number().optional().describe("Disposal proceeds amount"),
  disposalMethod: z.enum(["sale", "scrap", "write_off", "trade_in"]).optional().describe("Disposal method"),
};

export async function updateAssetStatus(args: {
  clientId?: string; accountingFirmId?: string;
  assetId: string; newStatus: string;
  disposalDate?: string; disposalProceeds?: number; disposalMethod?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.assetId, "ast", "assetId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, asset_code, name, status, net_book_value FROM fixed_assets WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.assetId, ...tw.params]);
      if (existing.rows.length === 0) return errorResponse("Asset not found or does not belong to this tenant.");

      const currentStatus = existing.rows[0].status as string;
      const transitionError = validateTransition(VALID_TRANSITIONS, currentStatus, args.newStatus);
      if (transitionError) return errorResponse(transitionError);

      const updates: string[] = [`status = $1`, `updated_at = NOW()`];
      const params: unknown[] = [args.newStatus];
      let paramIdx = 2;

      if (args.newStatus === "disposed") {
        if (args.disposalDate) { updates.push(`disposal_date = $${paramIdx++}`); params.push(args.disposalDate); }
        if (args.disposalProceeds !== undefined) { updates.push(`disposal_proceeds = $${paramIdx++}`); params.push(args.disposalProceeds); }
        if (args.disposalMethod) { updates.push(`disposal_method = $${paramIdx++}`); params.push(args.disposalMethod); }
        const nbv = parseFloat(existing.rows[0].net_book_value as string);
        const proceeds = args.disposalProceeds ?? 0;
        updates.push(`gain_loss_on_disposal = $${paramIdx++}`);
        params.push((proceeds - nbv).toFixed(2));
      }

      params.push(args.assetId);
      const updTw = tenantWhere(tenant, paramIdx + 1);
      await client.query(`UPDATE fixed_assets SET ${updates.join(", ")} WHERE id = $${paramIdx} AND ${updTw.sql}`, [...params, ...updTw.params]);

      return successResponse({
        id: args.assetId, assetCode: existing.rows[0].asset_code, name: existing.rows[0].name,
        previousStatus: currentStatus, newStatus: args.newStatus,
      });
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
