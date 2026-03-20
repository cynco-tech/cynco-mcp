import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getClausesSchema = {
  ...tenantSchema,
  category: z.string().optional().describe("Filter by clause category"),
  search: z.string().max(200).optional().describe("Search by title or description"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getClauses(args: {
  clientId?: string; accountingFirmId?: string;
  category?: string; search?: string; limit?: number; offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "c");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = ` AND c.is_archived = false`;

    if (args.category) { filters += ` AND c.category = $${nextParam}`; params.push(args.category); nextParam++; }
    if (args.search) {
      filters += ` AND (LOWER(c.title) LIKE $${nextParam} OR LOWER(COALESCE(c.description,'')) LIKE $${nextParam})`;
      params.push(`%${args.search.toLowerCase()}%`); nextParam++;
    }

    const limit = args.limit ?? 50;
    params.push(limit + 1, args.offset ?? 0);

    const result = await query(
      `SELECT c.id, c.title, c.category, c.description, c.has_financial_terms,
              c.is_approved, c.is_default, c.current_version, c.created_at
       FROM clauses c WHERE ${tw.sql} ${filters}
       ORDER BY c.category, c.title
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`, params);

    const hasMore = result.rows.length > limit;
    const clauses = result.rows.slice(0, limit).map(r => ({
      id: r.id, title: r.title, category: r.category, description: r.description,
      hasFinancialTerms: r.has_financial_terms, isApproved: r.is_approved,
      isDefault: r.is_default, currentVersion: r.current_version, createdAt: r.created_at,
    }));

    return successResponse({ clauses, clauseCount: clauses.length, hasMore });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
