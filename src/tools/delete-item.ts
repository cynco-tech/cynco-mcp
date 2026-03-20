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
import { tenantSchema } from "../utils/tools.js";

export const deleteItemSchema = {
  ...tenantSchema,
  itemId: z.string().describe("Item ID to delete"),
};

export async function deleteItem(args: {
  clientId?: string;
  accountingFirmId?: string;
  itemId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.itemId, "item", "itemId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, name FROM items WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.itemId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Item not found or does not belong to this tenant.");
      }

      await client.query(`DELETE FROM items WHERE id = $1`, [args.itemId]);

      return successResponse({
        id: args.itemId,
        name: existing.rows[0].name,
        deleted: true,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
