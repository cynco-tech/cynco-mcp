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

const lineSchema = z.object({
  accountId: z.string(),
  debitAmount: z.number().min(0).default(0),
  creditAmount: z.number().min(0).default(0),
  description: z.string().optional(),
  taxAmount: z.number().optional(),
  taxCode: z.string().optional(),
  taxRate: z.number().optional(),
});

const entrySchema = z.object({
  entryDate: z.string().describe("YYYY-MM-DD"),
  source: z.enum([
    "manual",
    "import",
    "adjustment",
    "opening_balance",
    "opening_balance_subledger",
    "closing_entry",
    "reversal",
    "bill",
    "invoice",
  ]),
  description: z.string(),
  memo: z.string().optional(),
  currency: z.string().optional().default("MYR"),
  vendorId: z.string().optional(),
  vendorName: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().optional(),
  sourceReference: z.string().optional(),
  createdBy: z.string().describe("User ID of the creator"),
  lines: z.array(lineSchema).min(2).describe("At least 2 lines required"),
});

export const createJournalEntriesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  coaId: z.string().describe("Chart of Accounts ID"),
  entries: z
    .array(entrySchema)
    .min(1)
    .max(50)
    .describe("Journal entries to create (max 50)"),
};

const SOURCE_PREFIX_MAP: Record<string, string> = {
  manual: "MAN",
  import: "IMP",
  adjustment: "ADJ",
  opening_balance: "OB",
  opening_balance_subledger: "OB",
  closing_entry: "CLS",
  reversal: "REV",
  bill: "BIL",
  invoice: "INV",
};

export async function createJournalEntries(args: {
  clientId?: string;
  accountingFirmId?: string;
  coaId: string;
  entries: z.infer<typeof entrySchema>[];
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.coaId, "coa", "coaId");

    const created: {
      id: string;
      entryNumber: string;
      totalDebit: string;
      totalCredit: string;
      lineCount: number;
    }[] = [];
    const errors: { index: number; error: string }[] = [];

    // Pre-validate all createdBy user IDs in one query
    const uniqueUserIds = [
      ...new Set(args.entries.map((e) => e.createdBy)),
    ];
    {
      const userResult = await query(
        `SELECT id FROM users WHERE id = ANY($1)`,
        [uniqueUserIds],
      );
      const foundUserIds = new Set(
        userResult.rows.map((r) => r.id as string),
      );
      const missingUserIds = uniqueUserIds.filter(
        (id) => !foundUserIds.has(id),
      );
      if (missingUserIds.length > 0) {
        return errorResponse(
          `User(s) not found: ${missingUserIds.join(", ")}. createdBy must reference a valid user ID.`,
        );
      }
    }

    for (let i = 0; i < args.entries.length; i++) {
      const entry = args.entries[i];
      try {
        const result = await withTransaction(async (client: pg.PoolClient) => {
          // Verify COA belongs to tenant and is active
          const coaTw = tenantWhere(tenant, 2);
          const coaResult = await client.query(
            `SELECT id FROM chart_of_accounts
             WHERE id = $1 AND ${coaTw.sql} AND is_active = true`,
            [args.coaId, ...coaTw.params],
          );
          if (coaResult.rows.length === 0) {
            throw new Error(
              "Chart of Accounts not found, not active, or does not belong to this tenant.",
            );
          }

          // Verify all account IDs exist in COA, are active, not headers
          const accountIds = [...new Set(entry.lines.map((l) => l.accountId))];
          const accResult = await client.query(
            `SELECT id, is_header_account, is_active FROM accounts
             WHERE coa_id = $1 AND id = ANY($2)`,
            [args.coaId, accountIds],
          );

          const foundAccounts = new Map(
            accResult.rows.map((r) => [r.id, r]),
          );
          for (const accId of accountIds) {
            const acc = foundAccounts.get(accId);
            if (!acc) {
              throw new Error(`Account ${accId} not found in COA ${args.coaId}.`);
            }
            if (!acc.is_active) {
              throw new Error(`Account ${accId} is inactive.`);
            }
            if (acc.is_header_account) {
              throw new Error(`Account ${accId} is a header account — cannot post to it.`);
            }
          }

          // Validate each line: debit XOR credit
          for (let j = 0; j < entry.lines.length; j++) {
            const line = entry.lines[j];
            if (line.debitAmount > 0 && line.creditAmount > 0) {
              throw new Error(`Line ${j + 1}: Cannot have both debit and credit amounts > 0.`);
            }
            if (line.debitAmount === 0 && line.creditAmount === 0) {
              throw new Error(`Line ${j + 1}: Must have either a debit or credit amount.`);
            }
          }

          // Validate balance
          const totalDebit = entry.lines.reduce((sum, l) => sum + l.debitAmount, 0);
          const totalCredit = entry.lines.reduce((sum, l) => sum + l.creditAmount, 0);
          if (Math.abs(totalDebit - totalCredit) >= 0.005) {
            throw new Error(
              `Entry is unbalanced: debit=${totalDebit.toFixed(2)}, credit=${totalCredit.toFixed(2)}.`,
            );
          }

          const period = entry.entryDate.substring(0, 7);

          // Advisory lock for entry number generation
          // Matches remix/app/models/journalEntry.model.ts:176-232
          await client.query(
            `SELECT pg_advisory_xact_lock(hashtext($1 || '-entry-number'))`,
            [args.coaId],
          );

          const prefix = SOURCE_PREFIX_MAP[entry.source] ?? "MAN";
          const year = new Date().getFullYear();
          const pattern = `${prefix}-${year}-%`;

          const maxResult = await client.query(
            `SELECT MAX(entry_number) as max_number FROM journal_entries
             WHERE coa_id = $1 AND entry_number LIKE $2`,
            [args.coaId, pattern],
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

          const entryNumber = `${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`;

          const jeId = generateId("je");
          await client.query(
            `INSERT INTO journal_entries (
              id, client_id, accounting_firm_id, coa_id,
              entry_number, entry_date, period, status, source,
              source_reference, description, memo,
              vendor_id, vendor_name, customer_id, customer_name,
              total_debit, total_credit, is_balanced,
              currency, created_by, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW()
            )`,
            [
              jeId,
              tenant.clientId,
              tenant.accountingFirmId,
              args.coaId,
              entryNumber,
              entry.entryDate,
              period,
              "draft",
              entry.source,
              entry.sourceReference ?? null,
              entry.description,
              entry.memo ?? null,
              entry.vendorId ?? null,
              entry.vendorName ?? null,
              entry.customerId ?? null,
              entry.customerName ?? null,
              totalDebit.toFixed(2),
              totalCredit.toFixed(2),
              true,
              entry.currency ?? "MYR",
              entry.createdBy,
            ],
          );

          for (let j = 0; j < entry.lines.length; j++) {
            const line = entry.lines[j];
            const jelId = generateId("jel");
            await client.query(
              `INSERT INTO journal_entry_lines (
                id, journal_entry_id, account_id, line_number,
                debit_amount, credit_amount, description,
                tax_amount, tax_code, tax_rate,
                created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
              )`,
              [
                jelId,
                jeId,
                line.accountId,
                j + 1,
                line.debitAmount.toFixed(2),
                line.creditAmount.toFixed(2),
                line.description ?? null,
                line.taxAmount?.toFixed(2) ?? null,
                line.taxCode ?? null,
                line.taxRate?.toFixed(2) ?? null,
              ],
            );
          }

          return {
            id: jeId,
            entryNumber,
            totalDebit: totalDebit.toFixed(2),
            totalCredit: totalCredit.toFixed(2),
            lineCount: entry.lines.length,
          };
        });

        created.push(result);
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return successResponse({
      created,
      errors,
      totalCreated: created.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
