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

export const deleteTagSchema = {
  ...tenantSchema,
  tagId: z.string().describe("Tag ID to delete"),
};

export async function deleteTag(args: {
  clientId?: string;
  accountingFirmId?: string;
  tagId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.tagId, "tag", "tagId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, name FROM tags WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.tagId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Tag not found or does not belong to this tenant.");
      }

      // Cascade delete removes entity_tags automatically (FK ON DELETE CASCADE)
      await client.query(`DELETE FROM tags WHERE id = $1`, [args.tagId]);

      return successResponse({ id: args.tagId, name: existing.rows[0].name, deleted: true });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
