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
import { tenantSchema } from "../utils/tools.js";

export const createAccountSchema = {
  ...tenantSchema,
  coaId: z.string().describe("Chart of Accounts ID"),
  accountCode: z.string().min(1).max(20).describe("Account code (e.g. 1100)"),
  accountName: z.string().min(1).max(255).describe("Account name"),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense",
    "contra_asset", "contra_liability", "contra_equity", "contra_revenue", "contra_expense"]).describe("Account type"),
  normalBalance: z.enum(["debit", "credit"]).describe("Normal balance direction"),
  parentAccountId: z.string().optional().describe("Parent account ID for hierarchy"),
  description: z.string().optional().describe("Account description"),
  isHeaderAccount: z.boolean().optional().describe("True if this is a grouping header (no postings)"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createAccount(args: {
  clientId?: string;
  accountingFirmId?: string;
  coaId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  parentAccountId?: string;
  description?: string;
  isHeaderAccount?: boolean;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.coaId, "coa", "coaId");
    validateTypeId(args.createdBy, "usr", "createdBy");
    if (args.parentAccountId) validateTypeId(args.parentAccountId, "acc", "parentAccountId");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify COA belongs to tenant
      const tw = tenantWhere(tenant, 2);
      const coaResult = await client.query(
        `SELECT id FROM chart_of_accounts WHERE id = $1 AND ${tw.sql}`,
        [args.coaId, ...tw.params],
      );
      if (coaResult.rows.length === 0) {
        return errorResponse("Chart of Accounts not found or does not belong to this tenant.");
      }

      // Check duplicate code within COA
      const dupResult = await client.query(
        `SELECT id FROM accounts WHERE coa_id = $1 AND account_code = $2`,
        [args.coaId, args.accountCode],
      );
      if (dupResult.rows.length > 0) {
        return errorResponse(`Account code "${args.accountCode}" already exists in this COA.`);
      }

      // Determine level from parent
      let level = 1;
      let path = args.accountCode;
      if (args.parentAccountId) {
        const parentResult = await client.query(
          `SELECT id, level, path FROM accounts WHERE id = $1 AND coa_id = $2`,
          [args.parentAccountId, args.coaId],
        );
        if (parentResult.rows.length === 0) {
          return errorResponse("Parent account not found in this COA.");
        }
        level = (parentResult.rows[0].level as number) + 1;
        path = `${parentResult.rows[0].path as string}.${args.accountCode}`;
      }

      const accountId = generateId("acc");
      await client.query(
        `INSERT INTO accounts (
          id, coa_id, account_code, account_name, account_type,
          normal_balance, parent_account_id, level, path, description,
          is_header_account, is_active, is_system_account,
          created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, true, false,
          $12, NOW(), NOW()
        )`,
        [
          accountId, args.coaId, args.accountCode, args.accountName, args.accountType,
          args.normalBalance, args.parentAccountId ?? null, level, path, args.description ?? null,
          args.isHeaderAccount ?? false, args.createdBy,
        ],
      );

      return successResponse({
        id: accountId,
        accountCode: args.accountCode,
        accountName: args.accountName,
        accountType: args.accountType,
        normalBalance: args.normalBalance,
        level,
        path,
        isActive: true,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
