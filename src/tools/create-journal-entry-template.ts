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

const templateLineSchema = z.object({
  accountId: z.string().describe("Account ID from the COA"),
  description: z.string().max(500).optional().describe("Line description"),
  debitAmount: z.number().min(0).optional().default(0).describe("Debit amount"),
  creditAmount: z.number().min(0).optional().default(0).describe("Credit amount"),
});

export const createJournalEntryTemplateSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  name: z.string().min(1).max(200).describe("Template name (e.g. 'Monthly Rent', 'Depreciation')"),
  description: z.string().max(1000).optional().describe("Template description"),
  coaId: z.string().describe("Chart of Accounts ID"),
  lines: z.array(templateLineSchema).min(2).max(50).describe("Template line items — must balance (total debits = total credits)"),
  isRecurring: z.boolean().optional().default(false).describe("Whether this template recurs automatically"),
  recurrencePattern: z.enum(["monthly", "quarterly", "yearly"]).optional().describe("Recurrence frequency"),
  createdBy: z.string().describe("User ID of the creator"),
};

interface TemplateLine {
  accountId: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
}

export async function createJournalEntryTemplate(args: {
  clientId?: string;
  accountingFirmId?: string;
  name: string;
  description?: string;
  coaId: string;
  lines: TemplateLine[];
  isRecurring?: boolean;
  recurrencePattern?: "monthly" | "quarterly" | "yearly";
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.coaId, "coa", "coaId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    // Validate balance
    let totalDebits = 0;
    let totalCredits = 0;
    for (const line of args.lines) {
      totalDebits += line.debitAmount ?? 0;
      totalCredits += line.creditAmount ?? 0;

      if ((line.debitAmount ?? 0) === 0 && (line.creditAmount ?? 0) === 0) {
        return errorResponse(
          "Each line must have a non-zero debit or credit amount.",
        );
      }
      if ((line.debitAmount ?? 0) > 0 && (line.creditAmount ?? 0) > 0) {
        return errorResponse(
          "A line cannot have both debit and credit amounts. Split into separate lines.",
        );
      }
    }

    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      return errorResponse(
        `Template does not balance: debits ${totalDebits.toFixed(2)} ≠ credits ${totalCredits.toFixed(2)}.`,
      );
    }

    if (args.isRecurring && !args.recurrencePattern) {
      return errorResponse(
        "recurrencePattern is required when isRecurring is true.",
      );
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate COA belongs to tenant
      const coaTw = tenantWhere(tenant, 2);
      const coaResult = await client.query(
        `SELECT id FROM chart_of_accounts WHERE id = $1 AND ${coaTw.sql} AND is_active = true`,
        [args.coaId, ...coaTw.params],
      );
      if (coaResult.rows.length === 0) {
        return errorResponse(
          "Chart of Accounts not found or does not belong to this tenant.",
        );
      }

      // Validate user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.createdBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(`User not found: ${args.createdBy}.`);
      }

      // Validate all account IDs exist in this COA
      const accountIds = args.lines.map((l) => l.accountId);
      const uniqueAccountIds = [...new Set(accountIds)];
      for (const accId of uniqueAccountIds) {
        validateTypeId(accId, "acc", "accountId");
      }

      const accResult = await client.query(
        `SELECT id, account_code, account_name, is_active, is_header_account
         FROM accounts
         WHERE coa_id = $1 AND id = ANY($2)`,
        [args.coaId, uniqueAccountIds],
      );

      const foundAccounts = new Map(
        accResult.rows.map((r) => [r.id, r]),
      );

      for (const accId of uniqueAccountIds) {
        const acc = foundAccounts.get(accId);
        if (!acc) {
          return errorResponse(`Account ${accId} not found in COA ${args.coaId}.`);
        }
        if (!acc.is_active) {
          return errorResponse(`Account ${accId} is inactive.`);
        }
        if (acc.is_header_account) {
          return errorResponse(`Account ${accId} is a header account — cannot post to it.`);
        }
      }

      // Build enriched lines with account details
      const enrichedLines = args.lines.map((line) => {
        const acc = foundAccounts.get(line.accountId)!;
        return {
          accountId: line.accountId,
          accountCode: acc.account_code,
          accountName: acc.account_name,
          debitAmount: line.debitAmount ?? 0,
          creditAmount: line.creditAmount ?? 0,
          description: line.description ?? null,
        };
      });

      const id = generateId("jet");
      await client.query(
        `INSERT INTO journal_entry_templates (
          id, client_id, accounting_firm_id, coa_id,
          name, description, source, lines,
          is_recurring, recurrence_pattern,
          is_active, created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'manual', $7,
          $8, $9, true, $10, NOW(), NOW()
        )`,
        [
          id,
          tenant.clientId,
          tenant.accountingFirmId,
          args.coaId,
          args.name,
          args.description ?? null,
          JSON.stringify(enrichedLines),
          args.isRecurring ?? false,
          args.recurrencePattern ?? null,
          args.createdBy,
        ],
      );

      return successResponse({
        id,
        name: args.name,
        lineCount: enrichedLines.length,
        totalAmount: totalDebits.toFixed(2),
        isRecurring: args.isRecurring ?? false,
        recurrencePattern: args.recurrencePattern ?? null,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
