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

export const updateTagSchema = {
  ...tenantSchema,
  tagId: z.string().describe("Tag ID to update"),
  name: z.string().min(1).max(100).optional().describe("Tag name"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("Hex color"),
  description: z.string().optional().describe("Tag description"),
};

export async function updateTag(args: {
  clientId?: string;
  accountingFirmId?: string;
  tagId: string;
  name?: string;
  color?: string;
  description?: string;
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

      const upd = buildUpdateSet();
      upd.add("name", args.name);
      upd.add("color", args.color);
      upd.add("description", args.description);

      if (upd.fields.length === 0) return errorResponse("No fields to update.");

      upd.fields.push(`updated_at = NOW()`);
      upd.values.push(args.tagId);
      await client.query(`UPDATE tags SET ${upd.fields.join(", ")} WHERE id = $${upd.paramIdx}`, upd.values);

      return successResponse({
        id: args.tagId,
        previousName: existing.rows[0].name,
        name: args.name ?? existing.rows[0].name,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
