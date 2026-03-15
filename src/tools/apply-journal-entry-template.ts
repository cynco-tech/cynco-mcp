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

export const applyJournalEntryTemplateSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  templateId: z.string().describe("Journal entry template ID to apply"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Transaction date (YYYY-MM-DD)"),
  memo: z.string().max(500).optional().describe("Optional memo override for this entry"),
  createdBy: z.string().describe("User ID creating this entry"),
  amountMultiplier: z.number().min(0.01).max(1000).optional().default(1).describe("Multiply all template amounts by this factor (default 1)"),
};

interface TemplateLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description: string | null;
}

export async function applyJournalEntryTemplate(args: {
  clientId?: string;
  accountingFirmId?: string;
  templateId: string;
  transactionDate: string;
  memo?: string;
  createdBy: string;
  amountMultiplier?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.templateId, "jet", "templateId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    const multiplier = args.amountMultiplier ?? 1;

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.createdBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(`User not found: ${args.createdBy}.`);
      }

      // Fetch template and verify tenant ownership
      const tw = tenantWhere(tenant, 2, "jet");
      const templateResult = await client.query(
        `SELECT jet.id, jet.name, jet.coa_id, jet.lines, jet.is_active
         FROM journal_entry_templates jet
         WHERE jet.id = $1 AND ${tw.sql}`,
        [args.templateId, ...tw.params],
      );

      if (templateResult.rows.length === 0) {
        return errorResponse(
          "Template not found or does not belong to this tenant.",
        );
      }

      const template = templateResult.rows[0];
      if (!template.is_active) {
        return errorResponse("Template is inactive. Reactivate it before applying.");
      }

      const lines = template.lines as TemplateLine[];
      const coaId = template.coa_id as string;

      // Check period is not closed
      const period = args.transactionDate.substring(0, 7); // YYYY-MM
      const twAb = tenantWhere(tenant, 2, "ab");
      const periodResult = await client.query(
        `SELECT COUNT(*) FILTER (WHERE ab.is_closed = true) AS closed_count
         FROM account_balances ab
         WHERE ab.period = $1 AND ${twAb.sql}`,
        [period, ...twAb.params],
      );
      const closedCount = parseInt(periodResult.rows[0].closed_count as string, 10);
      if (closedCount > 0) {
        return errorResponse(
          `Cannot create entry in closed period ${period}. Reopen the period first.`,
        );
      }

      // Generate entry number (per-COA lock to match create-journal-entries pattern)
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || '-entry-number'))`,
        [coaId],
      );
      const [year] = args.transactionDate.split("-");
      const maxResult = await client.query(
        `SELECT MAX(entry_number) AS max_number
         FROM journal_entries
         WHERE coa_id = $1 AND entry_number LIKE $2`,
        [coaId, `TPL-${year}-%`],
      );
      let nextSeq = 1;
      if (maxResult.rows[0]?.max_number) {
        const parts = (maxResult.rows[0].max_number as string).split("-");
        const lastPart = parts[parts.length - 1];
        const parsed = parseInt(lastPart, 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }
      const entryNumber = `TPL-${year}-${String(nextSeq).padStart(4, "0")}`;

      // Create journal entry
      const jeId = generateId("je");
      const memo = args.memo ?? `From template: ${template.name}`;

      const totalDebit = lines.reduce((sum, l) => sum + (l.debitAmount * multiplier), 0).toFixed(2);
      const totalCredit = lines.reduce((sum, l) => sum + (l.creditAmount * multiplier), 0).toFixed(2);

      await client.query(
        `INSERT INTO journal_entries (
          id, client_id, accounting_firm_id, coa_id,
          entry_number, entry_date, period,
          description, source, status,
          total_debit, total_credit,
          created_by, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          'manual', 'draft',
          $9, $10, $11, NOW(), NOW()
        )`,
        [
          jeId,
          tenant.clientId,
          tenant.accountingFirmId,
          coaId,
          entryNumber,
          args.transactionDate,
          period,
          memo,
          totalDebit,
          totalCredit,
          args.createdBy,
        ],
      );

      // Create journal entry lines
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineId = generateId("jel");
        const debit = (line.debitAmount * multiplier).toFixed(2);
        const credit = (line.creditAmount * multiplier).toFixed(2);

        await client.query(
          `INSERT INTO journal_entry_lines (
            id, journal_entry_id, account_id,
            line_number, description,
            debit_amount, credit_amount,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            lineId,
            jeId,
            line.accountId,
            i + 1,
            line.description ?? memo,
            debit,
            credit,
          ],
        );
      }

      // Update template last_created
      await client.query(
        `UPDATE journal_entry_templates SET last_created = $1, updated_at = NOW() WHERE id = $2`,
        [args.transactionDate, args.templateId],
      );

      return successResponse({
        journalEntryId: jeId,
        entryNumber,
        templateId: args.templateId,
        templateName: template.name,
        transactionDate: args.transactionDate,
        period,
        lineCount: lines.length,
        totalAmount: totalDebit,
        amountMultiplier: multiplier,
        status: "draft",
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
