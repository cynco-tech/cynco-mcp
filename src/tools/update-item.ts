import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import { tenantSchema, buildUpdateSet } from "../utils/tools.js";

export const updateItemSchema = {
  ...tenantSchema,
  itemId: z.string().describe("Item ID to update"),
  name: z.string().min(1).max(255).optional().describe("Item name"),
  description: z.string().optional().describe("Item description"),
  unitPrice: z.number().min(0).optional().describe("Unit price"),
  taxRate: z.number().min(0).max(100).optional().describe("Tax rate percentage"),
  discountRate: z.number().min(0).max(100).optional().describe("Discount rate percentage"),
};

export async function updateItem(args: {
  clientId?: string;
  accountingFirmId?: string;
  itemId: string;
  name?: string;
  description?: string;
  unitPrice?: number;
  taxRate?: number;
  discountRate?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.itemId, "item", "itemId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, name, unit_price FROM items WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.itemId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Item not found or does not belong to this tenant.");
      }

      const upd = buildUpdateSet();

      upd.add("name", args.name);
      upd.add("description", args.description);
      upd.add("unit_price", args.unitPrice);
      upd.add("tax_rate", args.taxRate);
      upd.add("discount_rate", args.discountRate);

      if (upd.fields.length === 0) {
        return errorResponse("No fields to update.");
      }

      upd.fields.push(`updated_at = NOW()`);
      upd.values.push(args.itemId);
      const updTw = tenantWhere(tenant, upd.paramIdx + 1);

      await client.query(
        `UPDATE items SET ${upd.fields.join(", ")} WHERE id = $${upd.paramIdx} AND ${updTw.sql}`,
        [...upd.values, ...updTw.params],
      );

      return successResponse({
        before: { name: existing.rows[0].name, unitPrice: existing.rows[0].unit_price },
        after: { id: args.itemId, name: args.name ?? existing.rows[0].name },
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
