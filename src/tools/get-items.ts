import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getItemsSchema = {
  ...tenantSchema,
  search: z.string().max(200).optional().describe("Search by name or description"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getItems(args: {
  clientId?: string;
  accountingFirmId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "i");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.search) {
      const searchLike = `%${args.search.toLowerCase()}%`;
      filters += ` AND (LOWER(i.name) LIKE $${nextParam} OR LOWER(COALESCE(i.description, '')) LIKE $${nextParam})`;
      params.push(searchLike);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT i.id, i.name, i.description, i.unit_price, i.tax_rate, i.discount_rate,
              i.created_at, i.updated_at
       FROM items i
       WHERE ${tw.sql} ${filters}
       ORDER BY i.name
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const items = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      unitPrice: r.unit_price,
      taxRate: r.tax_rate,
      discountRate: r.discount_rate,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return successResponse({
      items,
      itemCount: items.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
