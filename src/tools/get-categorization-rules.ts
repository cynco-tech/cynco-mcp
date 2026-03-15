import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getCategorizationRulesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  includeInactive: z.boolean().optional().default(false).describe("Include inactive rules"),
};

export async function getCategorizationRules(args: {
  clientId?: string;
  accountingFirmId?: string;
  includeInactive?: boolean;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "cr");
    const activeFilter = args.includeInactive ? "" : "AND cr.is_active = true";

    const result = await query(
      `SELECT cr.id, cr.pattern, cr.match_type, cr.coa_account_id,
              a.account_code, a.account_name,
              cr.category, cr.priority, cr.confidence,
              cr.times_applied, cr.times_overridden, cr.source, cr.is_active
       FROM categorization_rules cr
       LEFT JOIN accounts a ON a.id = cr.coa_account_id
       WHERE ${tw.sql} ${activeFilter}
       ORDER BY cr.priority DESC, cr.times_applied DESC`,
      tw.params,
    );

    return successResponse({
      rules: result.rows.map((r) => ({
        id: r.id,
        pattern: r.pattern,
        matchType: r.match_type,
        coaAccountId: r.coa_account_id,
        accountCode: r.account_code,
        accountName: r.account_name,
        category: r.category,
        priority: r.priority,
        confidence: r.confidence,
        timesApplied: r.times_applied,
        timesOverridden: r.times_overridden,
        source: r.source,
        isActive: r.is_active,
      })),
      totalRules: result.rows.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
