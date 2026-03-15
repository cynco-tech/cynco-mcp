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

export const updateBankTransactionStatusSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  transactionIds: z
    .array(z.string())
    .min(1)
    .max(100)
    .describe("Bank transaction IDs to update (max 100)"),
  status: z
    .enum(["categorized", "reconciled", "excluded"])
    .optional()
    .describe("New transaction status"),
  matchStatus: z
    .enum(["matched", "reconciled", "excluded"])
    .optional()
    .describe("New match status"),
  matchedJournalEntryId: z
    .string()
    .optional()
    .describe("Link to a journal entry (for matching/reconciliation)"),
  matchedGlEntryId: z
    .string()
    .optional()
    .describe("Link to a general ledger entry"),
  suggestedCoaAccountId: z
    .string()
    .optional()
    .describe("Update the suggested COA account"),
  matchConfidence: z
    .string()
    .optional()
    .describe("Update match confidence (0-1 decimal string)"),
};

export async function updateBankTransactionStatus(args: {
  clientId?: string;
  accountingFirmId?: string;
  transactionIds: string[];
  status?: "categorized" | "reconciled" | "excluded";
  matchStatus?: "matched" | "reconciled" | "excluded";
  matchedJournalEntryId?: string;
  matchedGlEntryId?: string;
  suggestedCoaAccountId?: string;
  matchConfidence?: string;
}) {
  try {
    const tenant = resolveTenant(args);

    for (const id of args.transactionIds) {
      validateTypeId(id, "btx", "transactionIds");
    }

    if (args.matchedJournalEntryId) {
      validateTypeId(args.matchedJournalEntryId, "je", "matchedJournalEntryId");
    }
    if (args.matchedGlEntryId) {
      validateTypeId(args.matchedGlEntryId, "gl", "matchedGlEntryId");
    }
    if (args.suggestedCoaAccountId) {
      validateTypeId(args.suggestedCoaAccountId, "acc", "suggestedCoaAccountId");
    }

    if (!args.status && !args.matchStatus && !args.matchedJournalEntryId && !args.matchedGlEntryId && !args.suggestedCoaAccountId && !args.matchConfidence) {
      return errorResponse("At least one field to update must be provided.");
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify all transactions belong to tenant
      const tw = tenantWhere(tenant, 2);
      const verifyResult = await client.query(
        `SELECT id, status, match_status FROM bank_transactions
         WHERE id = ANY($1) AND ${tw.sql}`,
        [args.transactionIds, ...tw.params],
      );

      const foundIds = new Set(verifyResult.rows.map((r) => r.id as string));
      const missingIds = args.transactionIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return errorResponse(
          `Transaction(s) not found or not owned by tenant: ${missingIds.join(", ")}`,
        );
      }

      // If linking to JE, verify it exists and belongs to tenant
      if (args.matchedJournalEntryId) {
        const jeTw = tenantWhere(tenant, 2);
        const jeResult = await client.query(
          `SELECT id FROM journal_entries WHERE id = $1 AND ${jeTw.sql}`,
          [args.matchedJournalEntryId, ...jeTw.params],
        );
        if (jeResult.rows.length === 0) {
          return errorResponse(
            `Journal entry not found or not owned by tenant: ${args.matchedJournalEntryId}`,
          );
        }
      }

      // If linking to GL entry, verify it exists and belongs to tenant
      if (args.matchedGlEntryId) {
        const glTw = tenantWhere(tenant, 2);
        const glResult = await client.query(
          `SELECT id FROM general_ledger WHERE id = $1 AND ${glTw.sql}`,
          [args.matchedGlEntryId, ...glTw.params],
        );
        if (glResult.rows.length === 0) {
          return errorResponse(
            `General ledger entry not found or not owned by tenant: ${args.matchedGlEntryId}`,
          );
        }
      }

      // Build update SET clause
      const setClauses: string[] = ["updated_at = NOW()"];
      const setParams: unknown[] = [];
      let paramIdx = 1;

      if (args.status) {
        setClauses.push(`status = $${paramIdx}`);
        setParams.push(args.status);
        paramIdx++;
      }
      if (args.matchStatus) {
        setClauses.push(`match_status = $${paramIdx}`);
        setParams.push(args.matchStatus);
        paramIdx++;
      }
      if (args.matchedJournalEntryId) {
        setClauses.push(`matched_journal_entry_id = $${paramIdx}`);
        setParams.push(args.matchedJournalEntryId);
        paramIdx++;
      }
      if (args.matchedGlEntryId) {
        setClauses.push(`matched_gl_entry_id = $${paramIdx}`);
        setParams.push(args.matchedGlEntryId);
        paramIdx++;
      }
      if (args.suggestedCoaAccountId) {
        setClauses.push(`suggested_coa_account_id = $${paramIdx}`);
        setParams.push(args.suggestedCoaAccountId);
        paramIdx++;
      }
      if (args.matchConfidence) {
        setClauses.push(`match_confidence = $${paramIdx}`);
        setParams.push(args.matchConfidence);
        paramIdx++;
      }

      // WHERE clause
      const whereTw = tenantWhere(tenant, paramIdx + 1);
      setParams.push(args.transactionIds);

      const updateResult = await client.query(
        `UPDATE bank_transactions
         SET ${setClauses.join(", ")}
         WHERE id = ANY($${paramIdx}) AND ${whereTw.sql}`,
        [...setParams, ...whereTw.params],
      );

      return successResponse({
        updatedCount: updateResult.rowCount,
        transactionIds: args.transactionIds,
        updates: {
          ...(args.status && { status: args.status }),
          ...(args.matchStatus && { matchStatus: args.matchStatus }),
          ...(args.matchedJournalEntryId && { matchedJournalEntryId: args.matchedJournalEntryId }),
          ...(args.matchedGlEntryId && { matchedGlEntryId: args.matchedGlEntryId }),
          ...(args.suggestedCoaAccountId && { suggestedCoaAccountId: args.suggestedCoaAccountId }),
          ...(args.matchConfidence && { matchConfidence: args.matchConfidence }),
        },
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
