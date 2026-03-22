import { z } from "zod";
import type pg from "pg";
import { query, withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["posted", "voided"],
  posted: ["approved", "voided"],
  approved: ["voided"],
  voided: [],
};

export const updateJournalEntryStatusSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  journalEntryId: z.string().describe("Journal entry ID to update"),
  newStatus: z
    .enum(["posted", "approved", "voided"])
    .describe("Target status"),
  changedBy: z.string().describe("User ID performing the change"),
  notes: z.string().optional().describe("Reason or notes for the status change"),
};

export async function updateJournalEntryStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  journalEntryId: string;
  newStatus: "posted" | "approved" | "voided";
  changedBy: string;
  notes?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.journalEntryId, "je", "journalEntryId");
    validateTypeId(args.changedBy, "usr", "changedBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.changedBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(
          `User not found: ${args.changedBy}. changedBy must reference a valid user ID.`,
        );
      }

      // Fetch and lock current entry with tenant scope (FOR UPDATE prevents concurrent status changes)
      const tw = tenantWhere(tenant, 2);
      const jeResult = await client.query(
        `SELECT id, status, entry_number, is_balanced
         FROM journal_entries
         WHERE id = $1 AND ${tw.sql}
         FOR UPDATE`,
        [args.journalEntryId, ...tw.params],
      );

      if (jeResult.rows.length === 0) {
        return errorResponse(
          "Journal entry not found or does not belong to this tenant.",
        );
      }

      const entry = jeResult.rows[0];
      const currentStatus = entry.status as string;
      const entryNumber = entry.entry_number as string;

      // Validate transition
      const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
      if (!allowed.includes(args.newStatus)) {
        return errorResponse(
          `Invalid status transition: ${currentStatus} → ${args.newStatus}. ` +
            `Allowed transitions from "${currentStatus}": ${allowed.length > 0 ? allowed.join(", ") : "none (terminal state)"}.`,
        );
      }

      // If posting, verify entry is balanced
      if (args.newStatus === "posted" && !entry.is_balanced) {
        return errorResponse(
          "Cannot post an unbalanced journal entry. Debits must equal credits.",
        );
      }

      // Update the journal entry status
      const updateFields: string[] = [
        `status = $1`,
        `updated_at = NOW()`,
      ];
      const updateParams: unknown[] = [args.newStatus];
      let paramIdx = 2;

      if (args.newStatus === "posted") {
        updateFields.push(`posted_by = $${paramIdx}`, `posted_at = NOW()`, `posting_date = NOW()`);
        updateParams.push(args.changedBy);
        paramIdx++;
      } else if (args.newStatus === "approved") {
        updateFields.push(`approved_by = $${paramIdx}`, `approved_at = NOW()`);
        updateParams.push(args.changedBy);
        paramIdx++;
      }

      updateFields.push(`modified_by = $${paramIdx}`);
      updateParams.push(args.changedBy);
      paramIdx++;

      updateParams.push(args.journalEntryId);
      const updTw = tenantWhere(tenant, paramIdx + 1);

      await client.query(
        `UPDATE journal_entries SET ${updateFields.join(", ")} WHERE id = $${paramIdx} AND ${updTw.sql}`,
        [...updateParams, ...updTw.params],
      );

      // Record status history
      const historyId = generateId("jesh");
      await client.query(
        `INSERT INTO journal_entry_status_history (
          id, journal_entry_id, from_status, to_status, changed_by, changed_at, notes
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [
          historyId,
          args.journalEntryId,
          currentStatus,
          args.newStatus,
          args.changedBy,
          args.notes ?? null,
        ],
      );

      // If voiding a posted/approved entry, reverse GL impact
      if (args.newStatus === "voided" && (currentStatus === "posted" || currentStatus === "approved")) {
        const glDeleteTw = tenantWhere(tenant, 2);
        const deleteResult = await client.query(
          `DELETE FROM general_ledger
           WHERE journal_entry_id = $1 AND ${glDeleteTw.sql}`,
          [args.journalEntryId, ...glDeleteTw.params],
        );
        const glEntriesRemoved = deleteResult.rowCount ?? 0;

        // Record the GL reversal in status history notes
        if (glEntriesRemoved > 0) {
          const originalNotes = args.notes ?? "";
          args.notes = originalNotes
            ? `${originalNotes} [${glEntriesRemoved} GL entries removed]`
            : `${glEntriesRemoved} GL entries removed`;
        }
      }

      // If posting, create GL entries from journal entry lines
      if (args.newStatus === "posted") {
        const linesResult = await client.query(
          `SELECT id, account_id, debit_amount, credit_amount, description
           FROM journal_entry_lines
           WHERE journal_entry_id = $1
           ORDER BY line_number`,
          [args.journalEntryId],
        );

        const jeData = await client.query(
          `SELECT entry_date, period, currency FROM journal_entries WHERE id = $1`,
          [args.journalEntryId],
        );
        const je = jeData.rows[0];

        for (const line of linesResult.rows) {
          // Calculate running balance for this account (tenant-scoped)
          const glTw = tenantWhere(tenant, 2);
          const balResult = await client.query(
            `SELECT COALESCE(
              (SELECT gl.running_balance FROM general_ledger gl
               WHERE gl.account_id = $1 AND ${glTw.sql}
               ORDER BY gl.posting_date DESC, gl.created_at DESC
               LIMIT 1), 0
            ) AS last_balance`,
            [line.account_id, ...glTw.params],
          );
          const lastBalance = parseFloat(balResult.rows[0].last_balance as string);
          const debit = parseFloat(line.debit_amount as string);
          const credit = parseFloat(line.credit_amount as string);
          const runningBalance = lastBalance + debit - credit;

          const glId = generateId("gl");
          await client.query(
            `INSERT INTO general_ledger (
              id, account_id, journal_entry_id, journal_entry_line_id,
              transaction_date, posting_date, period,
              debit_amount, credit_amount, running_balance,
              description, currency,
              client_id, accounting_firm_id,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
            [
              glId,
              line.account_id,
              args.journalEntryId,
              line.id,
              je.entry_date,
              je.period,
              debit.toFixed(2),
              credit.toFixed(2),
              runningBalance.toFixed(2),
              line.description,
              je.currency ?? "MYR",
              tenant.clientId,
              tenant.accountingFirmId,
            ],
          );
        }
      }

      return successResponse({
        journalEntryId: args.journalEntryId,
        entryNumber,
        previousStatus: currentStatus,
        newStatus: args.newStatus,
        changedBy: args.changedBy,
        glEntriesCreated: args.newStatus === "posted",
        glEntriesRemoved: args.newStatus === "voided" && (currentStatus === "posted" || currentStatus === "approved"),
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
