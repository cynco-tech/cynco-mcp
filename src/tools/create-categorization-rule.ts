import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const createCategorizationRuleSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  pattern: z.string().min(1).max(500).describe("Pattern to match against transaction descriptions"),
  matchType: z
    .enum(["exact", "contains", "starts_with", "regex", "payee"])
    .describe("How to match the pattern: exact, contains, starts_with, regex, or payee"),
  coaAccountId: z.string().optional().describe("COA account to categorize matching transactions into"),
  category: z.string().max(100).optional().describe("Category label (e.g. 'utilities', 'payroll')"),
  priority: z.number().int().min(0).max(1000).optional().default(0).describe("Higher priority rules match first (0-1000)"),
  confidence: z.number().min(0).max(1).optional().default(1).describe("Confidence score (0-1)"),
  createdBy: z.string().optional().describe("User ID of the creator"),
};

export async function createCategorizationRule(args: {
  clientId?: string;
  accountingFirmId?: string;
  pattern: string;
  matchType: "exact" | "contains" | "starts_with" | "regex" | "payee";
  coaAccountId?: string;
  category?: string;
  priority?: number;
  confidence?: number;
  createdBy?: string;
}) {
  try {
    const tenant = resolveTenant(args);

    if (args.coaAccountId) {
      validateTypeId(args.coaAccountId, "acc", "coaAccountId");
    }
    if (args.createdBy) {
      validateTypeId(args.createdBy, "usr", "createdBy");
    }

    if (!args.coaAccountId && !args.category) {
      return errorResponse(
        "At least one of coaAccountId or category must be provided — the rule needs to know what to categorize transactions as.",
      );
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate COA account exists and belongs to tenant
      if (args.coaAccountId) {
        const coaTw = tenantWhere(tenant, 1);
        const coaResult = await client.query(
          `SELECT id FROM chart_of_accounts WHERE ${coaTw.sql} AND is_active = true LIMIT 1`,
          coaTw.params,
        );
        if (coaResult.rows.length === 0) {
          return errorResponse("No active Chart of Accounts found for this tenant.");
        }
        const coaId = coaResult.rows[0].id;

        const accResult = await client.query(
          `SELECT id, is_active, is_header_account FROM accounts
           WHERE id = $1 AND coa_id = $2`,
          [args.coaAccountId, coaId],
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

      // Validate user exists
      if (args.createdBy) {
        const userResult = await client.query(
          `SELECT id FROM users WHERE id = $1`,
          [args.createdBy],
        );
        if (userResult.rows.length === 0) {
          return errorResponse(`User not found: ${args.createdBy}.`);
        }
      }

      // Validate regex pattern if match type is regex
      if (args.matchType === "regex") {
        try {
          new RegExp(args.pattern);
        } catch {
          return errorResponse(
            `Invalid regex pattern: "${args.pattern}". Please provide a valid regular expression.`,
          );
        }
      }

      const id = generateId("bcr");
      await client.query(
        `INSERT INTO categorization_rules (
          id, client_id, accounting_firm_id,
          pattern, match_type, coa_account_id, category,
          priority, confidence, source, created_by,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'user_created', $10,
          NOW(), NOW()
        )`,
        [
          id,
          tenant.clientId,
          tenant.accountingFirmId,
          args.pattern,
          args.matchType,
          args.coaAccountId ?? null,
          args.category ?? null,
          args.priority ?? 0,
          args.confidence ?? 1,
          args.createdBy ?? null,
        ],
      );

      return successResponse({
        id,
        pattern: args.pattern,
        matchType: args.matchType,
        coaAccountId: args.coaAccountId ?? null,
        category: args.category ?? null,
        priority: args.priority ?? 0,
        confidence: args.confidence ?? 1,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
