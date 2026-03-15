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

export const closePeriodSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  period: z.string().regex(/^\d{4}-\d{2}$/).describe("Period to close (YYYY-MM)"),
  closedBy: z.string().describe("User ID performing the close"),
};

export async function closePeriod(args: {
  clientId?: string;
  accountingFirmId?: string;
  period: string;
  closedBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.closedBy, "usr", "closedBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.closedBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(`User not found: ${args.closedBy}.`);
      }

      // Lock all balance rows for this period to prevent concurrent close/reopen
      const twLock = tenantWhere(tenant, 2, "ab");
      await client.query(
        `SELECT id FROM account_balances ab
         WHERE ab.period = $1 AND ${twLock.sql}
         FOR UPDATE`,
        [args.period, ...twLock.params],
      );

      // Check if any balances exist for this period
      const tw = tenantWhere(tenant, 2, "ab");
      const balanceResult = await client.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ab.is_closed = true) AS already_closed
         FROM account_balances ab
         WHERE ab.period = $1 AND ${tw.sql}`,
        [args.period, ...tw.params],
      );

      const total = parseInt(balanceResult.rows[0].total as string, 10);
      const alreadyClosed = parseInt(balanceResult.rows[0].already_closed as string, 10);

      if (total === 0) {
        return errorResponse(
          `No account balances found for period ${args.period}. Nothing to close.`,
        );
      }

      if (alreadyClosed === total) {
        return errorResponse(
          `Period ${args.period} is already fully closed (${total} accounts).`,
        );
      }

      // Check for draft journal entries in this period
      const twJe = tenantWhere(tenant, 2, "je");
      const draftResult = await client.query(
        `SELECT COUNT(*) AS draft_count
         FROM journal_entries je
         WHERE je.period = $1 AND ${twJe.sql} AND je.status = 'draft'`,
        [args.period, ...twJe.params],
      );
      const draftCount = parseInt(draftResult.rows[0].draft_count as string, 10);
      if (draftCount > 0) {
        return errorResponse(
          `Cannot close period ${args.period}: ${draftCount} draft journal entries remain. Post or void them first.`,
        );
      }

      // Close all account balances for this period
      const twUpdate = tenantWhere(tenant, 3, "ab");
      const updateResult = await client.query(
        `UPDATE account_balances ab
         SET is_closed = true, closed_at = NOW(), closed_by = $1
         WHERE ab.period = $2 AND ${twUpdate.sql} AND ab.is_closed = false`,
        [args.closedBy, args.period, ...twUpdate.params],
      );

      return successResponse({
        period: args.period,
        accountsClosed: updateResult.rowCount,
        previouslyClosed: alreadyClosed,
        totalAccounts: total,
        closedBy: args.closedBy,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
