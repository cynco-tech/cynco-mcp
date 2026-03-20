import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const searchDataroomSchema = {
  ...tenantSchema,
  search: z.string().min(1).max(200).describe("Search query (filename, description, or mime type)"),
  limit: z.number().int().min(1).max(50).optional().default(20).describe("Max results"),
};

export async function searchDataroom(args: {
  clientId?: string; accountingFirmId?: string; search: string; limit?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "f");
    const searchLike = `%${args.search.toLowerCase()}%`;
    const limit = args.limit ?? 20;

    const result = await query(
      `SELECT f.id, f.original_filename, f.size, f.mime_type, f.folder_id,
              f.description, f.uploaded_at
       FROM dataroom_files f
       WHERE ${tw.sql} AND f.is_archived = false
         AND (LOWER(f.original_filename) LIKE $${tw.nextParam}
              OR LOWER(COALESCE(f.description,'')) LIKE $${tw.nextParam}
              OR LOWER(COALESCE(f.mime_type,'')) LIKE $${tw.nextParam})
       ORDER BY f.uploaded_at DESC LIMIT $${tw.nextParam + 1}`,
      [...tw.params, searchLike, limit]);

    return successResponse({
      results: result.rows.map(r => ({
        id: r.id, filename: r.original_filename, size: r.size,
        mimeType: r.mime_type, folderId: r.folder_id, description: r.description,
        uploadedAt: r.uploaded_at,
      })),
      resultCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
