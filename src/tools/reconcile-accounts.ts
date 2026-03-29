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
import { validateTenantUser } from "../utils/tools.js";

export const reconcileAccountsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  glEntryIds: z.array(z.string()).min(1).max(100).describe("General Ledger entry IDs to mark as reconciled"),
  reconciledBy: z.string().describe("User ID performing the reconciliation"),
  reconciliationReference: z.string().max(100).optional().describe("Optional reference (e.g. bank statement number)"),
};

export async function reconcileAccounts(args: {
  clientId?: string;
  accountingFirmId?: string;
  glEntryIds: string[];
  reconciledBy: string;
  reconciliationReference?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.reconciledBy, "usr", "reconciledBy");

    for (const id of args.glEntryIds) {
      validateTypeId(id, "gl", "glEntryIds");
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate user exists and belongs to tenant
      const userCheck = await validateTenantUser(client, args.reconciledBy, tenant, "reconciledBy");
      if (!userCheck.valid) {
        return errorResponse(userCheck.error);
      }

      // Verify all GL entries exist and belong to tenant (via journal_entries)
      const twJe = tenantWhere(tenant, 2, "je");
      const glResult = await client.query(
        `SELECT gl.id, gl.is_reconciled
         FROM general_ledger gl
         JOIN journal_entries je ON je.id = gl.journal_entry_id
         WHERE gl.id = ANY($1) AND ${twJe.sql}`,
        [args.glEntryIds, ...twJe.params],
      );

      const foundIds = new Set(glResult.rows.map((r) => r.id));
      const missingIds = args.glEntryIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return errorResponse(
          `GL entries not found or do not belong to this tenant: ${missingIds.join(", ")}`,
        );
      }

      const alreadyReconciled = glResult.rows
        .filter((r) => r.is_reconciled)
        .map((r) => r.id);

      // Reconcile the entries (re-scope via journal_entries JOIN for tenant safety)
      const twUpdate = tenantWhere(tenant, 4, "je");
      const updateResult = await client.query(
        `UPDATE general_ledger gl
         SET is_reconciled = true,
             reconciled_date = CURRENT_DATE,
             reconciled_by = $1,
             reconciliation_reference = $2
         FROM journal_entries je
         WHERE je.id = gl.journal_entry_id
           AND gl.id = ANY($3) AND gl.is_reconciled = false
           AND ${twUpdate.sql}`,
        [
          args.reconciledBy,
          args.reconciliationReference ?? null,
          args.glEntryIds,
          ...twUpdate.params,
        ],
      );

      return successResponse({
        reconciled: updateResult.rowCount,
        alreadyReconciled: alreadyReconciled.length,
        skippedIds: alreadyReconciled,
        totalRequested: args.glEntryIds.length,
        reconciledBy: args.reconciledBy,
        reconciliationReference: args.reconciliationReference ?? null,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
