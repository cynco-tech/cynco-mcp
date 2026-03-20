import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getDataroomFilesSchema = {
  ...tenantSchema,
  folderId: z.string().optional().describe("Filter by folder ID"),
  search: z.string().max(200).optional().describe("Search by filename"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getDataroomFiles(args: {
  clientId?: string; accountingFirmId?: string;
  folderId?: string; search?: string; limit?: number; offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "f");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = ` AND f.is_archived = false`;
    if (args.folderId) { filters += ` AND f.folder_id = $${nextParam}`; params.push(args.folderId); nextParam++; }
    if (args.search) {
      filters += ` AND LOWER(f.original_filename) LIKE $${nextParam}`;
      params.push(`%${args.search.toLowerCase()}%`); nextParam++;
    }

    const limit = args.limit ?? 50;
    params.push(limit + 1, args.offset ?? 0);

    const result = await query(
      `SELECT f.id, f.filename, f.original_filename, f.size, f.mime_type,
              f.folder_id, f.description, f.is_favorite, f.uploaded_at, f.last_accessed_at
       FROM dataroom_files f WHERE ${tw.sql} ${filters}
       ORDER BY f.uploaded_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`, params);

    const hasMore = result.rows.length > limit;
    return successResponse({
      files: result.rows.slice(0, limit).map(r => ({
        id: r.id, filename: r.original_filename, size: r.size,
        mimeType: r.mime_type, folderId: r.folder_id, description: r.description,
        isFavorite: r.is_favorite, uploadedAt: r.uploaded_at, lastAccessedAt: r.last_accessed_at,
      })),
      fileCount: Math.min(result.rows.length, limit),
      hasMore, nextOffset: hasMore ? (args.offset ?? 0) + limit : null,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
