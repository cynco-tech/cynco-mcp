import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getDataroomFileDetailSchema = {
  ...tenantSchema,
  fileId: z.string().describe("Data room file ID"),
};

export async function getDataroomFileDetail(args: {
  clientId?: string; accountingFirmId?: string; fileId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.fileId, "dfil", "fileId");
    const tw = tenantWhere(tenant, 2);

    const result = await query(
      `SELECT f.id, f.filename, f.original_filename, f.size, f.mime_type,
              f.folder_id, f.description, f.metadata, f.is_favorite,
              f.uploaded_at, f.last_accessed_at, f.updated_at,
              (SELECT json_agg(json_build_object(
                'id', v.id, 'versionNumber', v.version_number, 'size', v.size,
                'changeNotes', v.change_notes, 'uploadedAt', v.uploaded_at
              ) ORDER BY v.version_number DESC)
              FROM dataroom_file_versions v WHERE v.file_id = f.id) AS versions
       FROM dataroom_files f WHERE f.id = $1 AND ${tw.sql}`,
      [args.fileId, ...tw.params]);

    if (result.rows.length === 0) return errorResponse("File not found or does not belong to this tenant.");
    const r = result.rows[0];
    return successResponse({
      id: r.id, filename: r.original_filename, size: r.size, mimeType: r.mime_type,
      folderId: r.folder_id, description: r.description, metadata: r.metadata,
      isFavorite: r.is_favorite, versions: r.versions ?? [],
      uploadedAt: r.uploaded_at, lastAccessedAt: r.last_accessed_at,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
