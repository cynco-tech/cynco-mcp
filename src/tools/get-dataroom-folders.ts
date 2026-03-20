import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getDataroomFoldersSchema = {
  ...tenantSchema,
  parentId: z.string().optional().describe("Filter by parent folder ID (null = root)"),
};

export async function getDataroomFolders(args: {
  clientId?: string; accountingFirmId?: string; parentId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "f");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let parentFilter = "";
    if (args.parentId) { parentFilter = ` AND f.parent_id = $${nextParam}`; params.push(args.parentId); }
    else { parentFilter = ` AND f.parent_id IS NULL`; }

    const result = await query(
      `SELECT f.id, f.name, f.path, f.parent_id, f.is_system_folder, f.is_root_folder,
              f.created_at,
              (SELECT COUNT(*) FROM dataroom_files df WHERE df.folder_id = f.id AND df.is_archived = false) AS file_count,
              (SELECT COUNT(*) FROM dataroom_folders sf WHERE sf.parent_id = f.id) AS subfolder_count
       FROM dataroom_folders f WHERE ${tw.sql} ${parentFilter}
       ORDER BY f.name`, params);

    return successResponse({
      folders: result.rows.map(r => ({
        id: r.id, name: r.name, path: r.path, parentId: r.parent_id,
        isSystemFolder: r.is_system_folder, isRootFolder: r.is_root_folder,
        fileCount: parseInt(r.file_count as string, 10),
        subfolderCount: parseInt(r.subfolder_count as string, 10),
        createdAt: r.created_at,
      })),
      folderCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
