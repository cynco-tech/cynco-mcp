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

export const reopenPeriodSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  period: z.string().regex(/^\d{4}-\d{2}$/).describe("Period to reopen (YYYY-MM)"),
  reopenedBy: z.string().describe("User ID performing the reopen"),
  reason: z.string().min(1).max(500).describe("Reason for reopening the period"),
};

export async function reopenPeriod(args: {
  clientId?: string;
  accountingFirmId?: string;
  period: string;
  reopenedBy: string;
  reason: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.reopenedBy, "usr", "reopenedBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.reopenedBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(`User not found: ${args.reopenedBy}.`);
      }

      // Lock all balance rows for this period to prevent concurrent close/reopen
      const twLock = tenantWhere(tenant, 2, "ab");
      await client.query(
        `SELECT id FROM account_balances ab
         WHERE ab.period = $1 AND ${twLock.sql}
         FOR UPDATE`,
        [args.period, ...twLock.params],
      );

      // Check if any balances exist and are closed
      const tw = tenantWhere(tenant, 2, "ab");
      const balanceResult = await client.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ab.is_closed = true) AS closed_count
         FROM account_balances ab
         WHERE ab.period = $1 AND ${tw.sql}`,
        [args.period, ...tw.params],
      );

      const total = parseInt(balanceResult.rows[0].total as string, 10);
      const closedCount = parseInt(balanceResult.rows[0].closed_count as string, 10);

      if (total === 0) {
        return errorResponse(
          `No account balances found for period ${args.period}.`,
        );
      }

      if (closedCount === 0) {
        return errorResponse(
          `Period ${args.period} is not closed — nothing to reopen.`,
        );
      }

      // Check that no later period is closed (would break carry-forward)
      const twLater = tenantWhere(tenant, 2, "ab");
      const laterResult = await client.query(
        `SELECT ab.period
         FROM account_balances ab
         WHERE ab.period > $1 AND ${twLater.sql} AND ab.is_closed = true
         GROUP BY ab.period
         ORDER BY ab.period
         LIMIT 1`,
        [args.period, ...twLater.params],
      );

      if (laterResult.rows.length > 0) {
        return errorResponse(
          `Cannot reopen period ${args.period}: later period ${laterResult.rows[0].period} is also closed. Reopen later periods first.`,
        );
      }

      // Reopen all account balances for this period
      const twUpdate = tenantWhere(tenant, 2, "ab");
      const updateResult = await client.query(
        `UPDATE account_balances ab
         SET is_closed = false, closed_at = NULL, closed_by = NULL
         WHERE ab.period = $1 AND ${twUpdate.sql} AND ab.is_closed = true`,
        [args.period, ...twUpdate.params],
      );

      return successResponse({
        period: args.period,
        accountsReopened: updateResult.rowCount,
        totalAccounts: total,
        reopenedBy: args.reopenedBy,
        reason: args.reason,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
