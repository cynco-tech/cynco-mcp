import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const createTagSchema = {
  ...tenantSchema,
  name: z.string().min(1).max(100).describe("Tag name"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("Hex color (e.g. #FF5733)"),
  description: z.string().optional().describe("Tag description"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createTag(args: {
  clientId?: string;
  accountingFirmId?: string;
  name: string;
  color?: string;
  description?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Check for duplicate name within tenant
      const tw = tenantWhere(tenant, 2);
      const dup = await client.query(
        `SELECT id FROM tags WHERE LOWER(name) = LOWER($1) AND ${tw.sql}`,
        [args.name, ...tw.params],
      );
      if (dup.rows.length > 0) {
        return errorResponse(`A tag named "${args.name}" already exists.`);
      }

      const tagId = generateId("tag");
      await client.query(
        `INSERT INTO tags (id, name, color, description, client_id, accounting_firm_id, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [tagId, args.name, args.color ?? null, args.description ?? null,
         tenant.clientId, tenant.accountingFirmId, args.createdBy],
      );

      return successResponse({ id: tagId, name: args.name, color: args.color ?? null });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
