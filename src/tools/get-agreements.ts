import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getAgreementsSchema = {
  ...tenantSchema,
  status: z.string().optional().describe("Filter by status (e.g. draft, active, executed)"),
  agreementType: z.string().optional().describe("Filter by type (e.g. contract, nda, sow)"),
  search: z.string().max(200).optional().describe("Search by title or counterparty name"),
  limit: z.number().int().min(1).max(100).optional().default(50).describe("Max results"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getAgreements(args: {
  clientId?: string; accountingFirmId?: string;
  status?: string; agreementType?: string; search?: string;
  limit?: number; offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "a");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = ` AND a.is_archived = false`;

    if (args.status) { filters += ` AND a.status = $${nextParam}`; params.push(args.status); nextParam++; }
    if (args.agreementType) { filters += ` AND a.agreement_type = $${nextParam}`; params.push(args.agreementType); nextParam++; }
    if (args.search) {
      filters += ` AND (LOWER(a.title) LIKE $${nextParam} OR LOWER(COALESCE(a.counterparty_name,'')) LIKE $${nextParam})`;
      params.push(`%${args.search.toLowerCase()}%`); nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT a.id, a.agreement_number, a.title, a.agreement_type, a.status,
              a.counterparty_name, a.effective_date, a.expiration_date,
              a.auto_renew, a.created_at
       FROM agreements a
       WHERE ${tw.sql} ${filters}
       ORDER BY a.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`, params);

    const hasMore = result.rows.length > limit;
    const agreements = result.rows.slice(0, limit).map(r => ({
      id: r.id, agreementNumber: r.agreement_number, title: r.title,
      agreementType: r.agreement_type, status: r.status,
      counterpartyName: r.counterparty_name,
      effectiveDate: r.effective_date, expirationDate: r.expiration_date,
      autoRenew: r.auto_renew, createdAt: r.created_at,
    }));

    return successResponse({ agreements, agreementCount: agreements.length, hasMore, nextOffset: hasMore ? offset + limit : null });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
