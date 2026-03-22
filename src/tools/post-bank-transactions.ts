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

export const postBankTransactionsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  transactionIds: z
    .array(z.string())
    .min(1)
    .max(100)
    .describe("Bank transaction IDs to post to GL (max 100)"),
  createdBy: z.string().describe("User ID performing the posting"),
};

export async function postBankTransactions(args: {
  clientId?: string;
  accountingFirmId?: string;
  transactionIds: string[];
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    for (const id of args.transactionIds) {
      validateTypeId(id, "btx", "transactionIds");
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.createdBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(
          `User not found: ${args.createdBy}. createdBy must reference a valid user ID.`,
        );
      }

      // Fetch transactions with tenant scope
      const tw = tenantWhere(tenant, 2, "bt");
      const txResult = await client.query(
        `SELECT bt.id, bt.financial_account_id, bt.transaction_date,
                bt.transaction_type, bt.amount, bt.raw_description,
                bt.clean_description, bt.payee_name,
                bt.suggested_coa_account_id, bt.status, bt.match_status,
                fa.linked_account_id
         FROM bank_transactions bt
         JOIN financial_accounts fa ON bt.financial_account_id = fa.id
         WHERE bt.id = ANY($1) AND ${tw.sql}`,
        [args.transactionIds, ...tw.params],
      );

      const foundIds = new Set(txResult.rows.map((r) => r.id as string));
      const missingIds = args.transactionIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return errorResponse(
          `Transaction(s) not found or not owned by tenant: ${missingIds.join(", ")}`,
        );
      }

      // Find COA for tenant
      const coaTw = tenantWhere(tenant, 1);
      const coaResult = await client.query(
        `SELECT id FROM chart_of_accounts WHERE ${coaTw.sql} AND is_active = true LIMIT 1`,
        coaTw.params,
      );
      if (coaResult.rows.length === 0) {
        return errorResponse("No active Chart of Accounts found for this tenant.");
      }
      const coaId = coaResult.rows[0].id as string;

      const posted: { transactionId: string; journalEntryId: string; entryNumber: string }[] = [];
      const errors: { transactionId: string; error: string }[] = [];

      // Advisory lock for entry number generation
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || '-entry-number'))`,
        [coaId],
      );

      // Get current max entry number for BT prefix
      const year = new Date().getFullYear();
      const prefix = "BT";
      const pattern = `${prefix}-${year}-%`;
      const maxResult = await client.query(
        `SELECT MAX(entry_number) as max_number FROM journal_entries
         WHERE coa_id = $1 AND entry_number LIKE $2`,
        [coaId, pattern],
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

      for (const tx of txResult.rows) {
        const txId = tx.id as string;
        const status = tx.status as string;

        // Skip already-posted transactions
        if (status === "posted" || status === "reconciled") {
          errors.push({ transactionId: txId, error: `Already ${status} — skipped.` });
          continue;
        }

        // Need a COA account to post against
        const coaAccountId = tx.suggested_coa_account_id ?? null;
        const bankAccountId = tx.linked_account_id ?? null;

        if (!coaAccountId) {
          errors.push({
            transactionId: txId,
            error: "No suggested COA account — categorize first (set suggestedCoaAccountId).",
          });
          continue;
        }

        if (!bankAccountId) {
          errors.push({
            transactionId: txId,
            error: "Financial account has no linked COA account — link one first.",
          });
          continue;
        }

        const amount = parseFloat(tx.amount as string);
        const txType = tx.transaction_type as string;
        const description = (tx.clean_description ?? tx.raw_description) as string;
        const payee = tx.payee_name as string | null;
        const entryDate = tx.transaction_date;
        const period = (entryDate as string).substring(0, 7);

        const entryNumber = `${prefix}-${year}-${String(nextSeq).padStart(4, "0")}`;
        nextSeq++;

        // Create journal entry:
        // Debit: If debit transaction → expense/asset account; credit → bank account
        // Credit: If credit transaction → bank account debit; income/liability account credit
        const jeId = generateId("je");
        await client.query(
          `INSERT INTO journal_entries (
            id, client_id, accounting_firm_id, coa_id,
            entry_number, entry_date, period, status, source,
            description, total_debit, total_credit, is_balanced,
            currency, created_by, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, 'posted', 'import',
            $8, $9, $9, true,
            'MYR', $10, NOW(), NOW()
          )`,
          [
            jeId,
            tenant.clientId,
            tenant.accountingFirmId,
            coaId,
            entryNumber,
            entryDate,
            period,
            `${payee ? payee + " — " : ""}${description}`,
            amount.toFixed(2),
            args.createdBy,
          ],
        );

        // Create two journal entry lines (double-entry)
        const line1Id = generateId("jel");
        const line2Id = generateId("jel");

        if (txType === "debit") {
          // Money out: debit expense/asset, credit bank
          await client.query(
            `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, line_number, debit_amount, credit_amount, description, created_at, updated_at)
             VALUES ($1, $2, $3, 1, $4, 0, $5, NOW(), NOW())`,
            [line1Id, jeId, coaAccountId, amount.toFixed(2), description],
          );
          await client.query(
            `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, line_number, debit_amount, credit_amount, description, created_at, updated_at)
             VALUES ($1, $2, $3, 2, 0, $4, $5, NOW(), NOW())`,
            [line2Id, jeId, bankAccountId, amount.toFixed(2), description],
          );
        } else {
          // Money in: debit bank, credit income/liability
          await client.query(
            `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, line_number, debit_amount, credit_amount, description, created_at, updated_at)
             VALUES ($1, $2, $3, 1, $4, 0, $5, NOW(), NOW())`,
            [line1Id, jeId, bankAccountId, amount.toFixed(2), description],
          );
          await client.query(
            `INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, line_number, debit_amount, credit_amount, description, created_at, updated_at)
             VALUES ($1, $2, $3, 2, 0, $4, $5, NOW(), NOW())`,
            [line2Id, jeId, coaAccountId, amount.toFixed(2), description],
          );
        }

        // Create GL entries for the posted journal entry
        const jeLines = [
          { lineId: line1Id, accountId: txType === "debit" ? coaAccountId : bankAccountId, debit: amount, credit: 0 },
          { lineId: line2Id, accountId: txType === "debit" ? bankAccountId : coaAccountId, debit: 0, credit: amount },
        ];

        for (const glLine of jeLines) {
          const glTw = tenantWhere(tenant, 2);
          const balResult = await client.query(
            `SELECT COALESCE(
              (SELECT running_balance FROM general_ledger
               WHERE account_id = $1 AND ${glTw.sql}
               ORDER BY posting_date DESC, created_at DESC
               LIMIT 1), 0
            ) AS last_balance`,
            [glLine.accountId, ...glTw.params],
          );
          const lastBalance = parseFloat(balResult.rows[0].last_balance as string);
          const runningBalance = lastBalance + glLine.debit - glLine.credit;

          const glId = generateId("gl");
          await client.query(
            `INSERT INTO general_ledger (
              id, account_id, journal_entry_id, journal_entry_line_id,
              transaction_date, posting_date, period,
              debit_amount, credit_amount, running_balance,
              description, currency,
              client_id, accounting_firm_id,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, 'MYR', $11, $12, NOW())`,
            [
              glId,
              glLine.accountId,
              jeId,
              glLine.lineId,
              entryDate,
              period,
              glLine.debit.toFixed(2),
              glLine.credit.toFixed(2),
              runningBalance.toFixed(2),
              description,
              tenant.clientId,
              tenant.accountingFirmId,
            ],
          );
        }

        // Update bank transaction status (tenant filter for defense-in-depth)
        const btTw = tenantWhere(tenant, 3);
        await client.query(
          `UPDATE bank_transactions
           SET status = 'posted', match_status = 'matched',
               matched_journal_entry_id = $1, updated_at = NOW()
           WHERE id = $2 AND ${btTw.sql}`,
          [jeId, txId, ...btTw.params],
        );

        posted.push({
          transactionId: txId,
          journalEntryId: jeId,
          entryNumber,
        });
      }

      return successResponse({
        posted,
        errors,
        totalPosted: posted.length,
        totalErrors: errors.length,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
