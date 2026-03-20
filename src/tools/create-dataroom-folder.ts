import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const createDataroomFolderSchema = {
  ...tenantSchema,
  name: z.string().min(1).max(255).describe("Folder name"),
  parentId: z.string().optional().describe("Parent folder ID (null = root level)"),
  createdBy: z.string().describe("User ID"),
};

export async function createDataroomFolder(args: {
  clientId?: string; accountingFirmId?: string;
  name: string; parentId?: string; createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");
    if (args.parentId) validateTypeId(args.parentId, "dfld", "parentId");

    return await withTransaction(async (client: pg.PoolClient) => {
      let path = `/${args.name}`;
      if (args.parentId) {
        const tw = tenantWhere(tenant, 2);
        const parentResult = await client.query(
          `SELECT id, path FROM dataroom_folders WHERE id = $1 AND ${tw.sql}`,
          [args.parentId, ...tw.params]);
        if (parentResult.rows.length === 0) return errorResponse("Parent folder not found.");
        path = `${parentResult.rows[0].path}/${args.name}`;
      }

      const folderId = generateId("dfld");
      await client.query(
        `INSERT INTO dataroom_folders (id, name, path, parent_id, client_id, accounting_firm_id, created_by, is_system_folder, is_root_folder, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, false, NOW(), NOW())`,
        [folderId, args.name, path, args.parentId ?? null,
         tenant.clientId, tenant.accountingFirmId, args.createdBy]);

      return successResponse({ id: folderId, name: args.name, path, parentId: args.parentId ?? null });
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
