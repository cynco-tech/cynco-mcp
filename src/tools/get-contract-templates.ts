import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getContractTemplatesSchema = {
  ...tenantSchema,
  agreementType: z.string().optional().describe("Filter by agreement type"),
};

export async function getContractTemplates(args: {
  clientId?: string; accountingFirmId?: string; agreementType?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "t");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = ` AND t.is_archived = false`;
    if (args.agreementType) { filters += ` AND t.agreement_type = $${nextParam}`; params.push(args.agreementType); nextParam++; }

    const result = await query(
      `SELECT t.id, t.name, t.description, t.agreement_type, t.industry,
              t.is_default, t.usage_count, t.created_at
       FROM contract_templates t WHERE ${tw.sql} ${filters} ORDER BY t.name`, params);

    return successResponse({
      templates: result.rows.map(r => ({
        id: r.id, name: r.name, description: r.description,
        agreementType: r.agreement_type, industry: r.industry,
        isDefault: r.is_default, usageCount: r.usage_count, createdAt: r.created_at,
      })),
      templateCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
