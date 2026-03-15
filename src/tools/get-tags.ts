import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getTagsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  search: z.string().max(200).optional().describe("Search tags by name"),
  entityType: z.string().optional().describe("Filter to tags used on a specific entity type (e.g. 'vendor', 'customer', 'invoice', 'bill')"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results (default 50, max 100)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getTags(args: {
  clientId?: string;
  accountingFirmId?: string;
  search?: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "t");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.search) {
      const searchLike = `%${args.search.toLowerCase()}%`;
      filters += ` AND LOWER(t.name) LIKE $${nextParam}`;
      params.push(searchLike);
      nextParam++;
    }
    if (args.entityType) {
      filters += ` AND EXISTS (
        SELECT 1 FROM entity_tags et
        WHERE et.tag_id = t.id AND et.entity_type = $${nextParam}
      )`;
      params.push(args.entityType);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          t.id,
          t.name,
          t.color,
          t.description,
          t.created_at,
          (SELECT COUNT(*) FROM entity_tags et WHERE et.tag_id = t.id) AS usage_count
       FROM tags t
       WHERE ${tw.sql} ${filters}
       ORDER BY t.name ASC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const tags = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description,
      usageCount: parseInt(r.usage_count as string, 10),
      createdAt: r.created_at,
    }));

    return successResponse({
      tags,
      tagCount: tags.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
