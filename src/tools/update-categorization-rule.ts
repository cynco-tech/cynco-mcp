import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const updateCategorizationRuleSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  ruleId: z.string().describe("Categorization rule ID to update"),
  pattern: z.string().min(1).max(500).optional().describe("Updated pattern"),
  matchType: z
    .enum(["exact", "contains", "starts_with", "regex", "payee"])
    .optional()
    .describe("Updated match type"),
  coaAccountId: z.string().optional().describe("Updated COA account ID"),
  category: z.string().max(100).optional().describe("Updated category label"),
  priority: z.number().int().min(0).max(1000).optional().describe("Updated priority (0-1000)"),
  confidence: z.number().min(0).max(1).optional().describe("Updated confidence (0-1)"),
  isActive: z.boolean().optional().describe("Activate or deactivate the rule"),
};

export async function updateCategorizationRule(args: {
  clientId?: string;
  accountingFirmId?: string;
  ruleId: string;
  pattern?: string;
  matchType?: "exact" | "contains" | "starts_with" | "regex" | "payee";
  coaAccountId?: string;
  category?: string;
  priority?: number;
  confidence?: number;
  isActive?: boolean;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.ruleId, "bcr", "ruleId");

    if (args.coaAccountId) {
      validateTypeId(args.coaAccountId, "acc", "coaAccountId");
    }

    const hasUpdate = args.pattern !== undefined || args.matchType !== undefined ||
      args.coaAccountId !== undefined || args.category !== undefined ||
      args.priority !== undefined || args.confidence !== undefined ||
      args.isActive !== undefined;

    if (!hasUpdate) {
      return errorResponse("At least one field to update must be provided.");
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify rule exists and belongs to tenant
      const tw = tenantWhere(tenant, 2);
      const ruleResult = await client.query(
        `SELECT id, pattern, match_type FROM categorization_rules
         WHERE id = $1 AND ${tw.sql}`,
        [args.ruleId, ...tw.params],
      );

      if (ruleResult.rows.length === 0) {
        return errorResponse(
          "Categorization rule not found or does not belong to this tenant.",
        );
      }

      // Validate COA account if provided
      if (args.coaAccountId) {
        const coaTw = tenantWhere(tenant, 1);
        const coaResult = await client.query(
          `SELECT id FROM chart_of_accounts WHERE ${coaTw.sql} AND is_active = true LIMIT 1`,
          coaTw.params,
        );
        if (coaResult.rows.length === 0) {
          return errorResponse("No active Chart of Accounts found for this tenant.");
        }

        const accResult = await client.query(
          `SELECT id, is_active, is_header_account FROM accounts
           WHERE id = $1 AND coa_id = $2`,
          [args.coaAccountId, coaResult.rows[0].id],
        );
        if (accResult.rows.length === 0) {
          return errorResponse(`Account ${args.coaAccountId} not found in this tenant's COA.`);
        }
        if (!accResult.rows[0].is_active) {
          return errorResponse(`Account ${args.coaAccountId} is inactive.`);
        }
        if (accResult.rows[0].is_header_account) {
          return errorResponse(`Account ${args.coaAccountId} is a header account — cannot categorize to it.`);
        }
      }

      // Validate regex if updating pattern or match type
      const effectiveMatchType = args.matchType ?? (ruleResult.rows[0].match_type as string);
      const effectivePattern = args.pattern ?? (ruleResult.rows[0].pattern as string);
      if (effectiveMatchType === "regex") {
        try {
          new RegExp(effectivePattern);
        } catch {
          return errorResponse(
            `Invalid regex pattern: "${effectivePattern}". Please provide a valid regular expression.`,
          );
        }
      }

      // Build SET clause
      const setClauses: string[] = ["updated_at = NOW()"];
      const setParams: unknown[] = [];
      let paramIdx = 1;

      if (args.pattern !== undefined) {
        setClauses.push(`pattern = $${paramIdx}`);
        setParams.push(args.pattern);
        paramIdx++;
      }
      if (args.matchType !== undefined) {
        setClauses.push(`match_type = $${paramIdx}`);
        setParams.push(args.matchType);
        paramIdx++;
      }
      if (args.coaAccountId !== undefined) {
        setClauses.push(`coa_account_id = $${paramIdx}`);
        setParams.push(args.coaAccountId);
        paramIdx++;
      }
      if (args.category !== undefined) {
        setClauses.push(`category = $${paramIdx}`);
        setParams.push(args.category);
        paramIdx++;
      }
      if (args.priority !== undefined) {
        setClauses.push(`priority = $${paramIdx}`);
        setParams.push(args.priority);
        paramIdx++;
      }
      if (args.confidence !== undefined) {
        setClauses.push(`confidence = $${paramIdx}`);
        setParams.push(args.confidence);
        paramIdx++;
      }
      if (args.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIdx}`);
        setParams.push(args.isActive);
        paramIdx++;
      }

      setParams.push(args.ruleId);

      await client.query(
        `UPDATE categorization_rules SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
        setParams,
      );

      return successResponse({
        ruleId: args.ruleId,
        updated: Object.fromEntries(
          Object.entries({
            pattern: args.pattern,
            matchType: args.matchType,
            coaAccountId: args.coaAccountId,
            category: args.category,
            priority: args.priority,
            confidence: args.confidence,
            isActive: args.isActive,
          }).filter(([, v]) => v !== undefined),
        ),
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
