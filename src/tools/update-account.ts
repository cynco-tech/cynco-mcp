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
import { tenantSchema, buildUpdateSet } from "../utils/tools.js";

export const updateAccountSchema = {
  ...tenantSchema,
  accountId: z.string().describe("Account ID to update"),
  accountName: z.string().min(1).max(255).optional().describe("Account name"),
  description: z.string().optional().describe("Account description"),
  isActive: z.boolean().optional().describe("Active status"),
  isHeaderAccount: z.boolean().optional().describe("Header account flag"),
};

export async function updateAccount(args: {
  clientId?: string;
  accountingFirmId?: string;
  accountId: string;
  accountName?: string;
  description?: string;
  isActive?: boolean;
  isHeaderAccount?: boolean;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.accountId, "acc", "accountId");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify account belongs to tenant's COA
      const tw = tenantWhere(tenant, 2, "c");
      const existing = await client.query(
        `SELECT a.id, a.account_name, a.account_code, a.is_system_account
         FROM accounts a
         JOIN chart_of_accounts c ON c.id = a.coa_id
         WHERE a.id = $1 AND ${tw.sql}
         FOR UPDATE OF a`,
        [args.accountId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Account not found or does not belong to this tenant.");
      }
      if (existing.rows[0].is_system_account && args.isActive === false) {
        return errorResponse("Cannot deactivate a system account.");
      }

      const upd = buildUpdateSet();

      upd.add("account_name", args.accountName);
      upd.add("description", args.description);
      upd.add("is_active", args.isActive);
      upd.add("is_header_account", args.isHeaderAccount);

      if (upd.fields.length === 0) return errorResponse("No fields to update.");

      upd.fields.push(`updated_at = NOW()`);
      upd.values.push(args.accountId);
      const updTw = tenantWhere(tenant, upd.paramIdx + 1);
      await client.query(`UPDATE accounts SET ${upd.fields.join(", ")} WHERE id = $${upd.paramIdx} AND ${updTw.sql}`, [...upd.values, ...updTw.params]);

      return successResponse({
        id: args.accountId,
        accountCode: existing.rows[0].account_code,
        previousName: existing.rows[0].account_name,
        accountName: args.accountName ?? existing.rows[0].account_name,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
