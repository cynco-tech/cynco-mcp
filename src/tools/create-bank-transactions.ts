import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import { computeTransactionHash } from "../utils/hash.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

const transactionSchema = z.object({
  transactionDate: z.string().describe("YYYY-MM-DD"),
  transactionType: z.enum(["credit", "debit"]),
  amount: z.string().describe("Positive decimal string"),
  rawDescription: z.string(),
  reference: z.string().optional(),
  valueDate: z.string().optional(),
  cleanDescription: z.string().optional(),
  balanceAfter: z.string().optional(),
  category: z.string().optional(),
  payeeName: z.string().optional(),
  suggestedCoaAccountId: z.string().optional(),
  matchConfidence: z.string().optional(),
  aiMetadata: z.record(z.unknown()).optional(),
});

export const createBankTransactionsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  financialAccountId: z.string().describe("Financial account to import into"),
  statementImportId: z.string().optional().describe("Optional statement import reference"),
  transactions: z
    .array(transactionSchema)
    .min(1)
    .max(500)
    .describe("Transactions to create (max 500)"),
};

export async function createBankTransactions(args: {
  clientId?: string;
  accountingFirmId?: string;
  financialAccountId: string;
  statementImportId?: string;
  transactions: z.infer<typeof transactionSchema>[];
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.financialAccountId, "fac", "financialAccountId");

    for (const tx of args.transactions) {
      const amt = parseFloat(tx.amount);
      if (isNaN(amt) || amt <= 0) {
        return errorResponse(
          `Invalid amount "${tx.amount}" — must be a positive number.`,
        );
      }
    }

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify financial account belongs to tenant and is active
      const facWhere = tenantWhere(tenant, 2);
      const facResult = await client.query(
        `SELECT id FROM financial_accounts
         WHERE id = $1 AND ${facWhere.sql} AND is_active = true`,
        [args.financialAccountId, ...facWhere.params],
      );
      if (facResult.rows.length === 0) {
        return errorResponse(
          "Financial account not found, not active, or does not belong to this tenant.",
        );
      }

      // Validate suggested COA account IDs if any
      const suggestedIds = [
        ...new Set(
          args.transactions
            .map((tx) => tx.suggestedCoaAccountId)
            .filter((id): id is string => id != null),
        ),
      ];
      if (suggestedIds.length > 0) {
        const coaWhere = tenantWhere(tenant, 1);
        const coaResult = await client.query(
          `SELECT id FROM chart_of_accounts
           WHERE ${coaWhere.sql} AND is_active = true AND access_type = 'specific'
           LIMIT 1`,
          coaWhere.params,
        );
        if (coaResult.rows.length > 0) {
          const coaId = coaResult.rows[0].id;
          const validResult = await client.query(
            `SELECT id FROM accounts
             WHERE coa_id = $1 AND id = ANY($2) AND is_active = true`,
            [coaId, suggestedIds],
          );
          const validIds = new Set(validResult.rows.map((r) => r.id));
          const invalidIds = suggestedIds.filter((id) => !validIds.has(id));
          if (invalidIds.length > 0) {
            return errorResponse(
              `Invalid suggested COA account IDs: ${invalidIds.join(", ")}`,
            );
          }
        }
      }

      // Compute hashes and check for existing duplicates
      const txWithHash = args.transactions.map((tx) => ({
        ...tx,
        hash: computeTransactionHash(
          args.financialAccountId,
          tx.transactionDate,
          tx.transactionType,
          tx.amount,
          tx.rawDescription,
          tx.reference,
        ),
      }));

      const allHashes = txWithHash.map((tx) => tx.hash);
      const hashWhere = tenantWhere(tenant, 1);
      const existingResult = await client.query(
        `SELECT transaction_hash FROM bank_transactions
         WHERE ${hashWhere.sql}
           AND transaction_hash = ANY($${hashWhere.nextParam})
           AND duplicate_of_id IS NULL`,
        [...hashWhere.params, allHashes],
      );
      const existingHashes = new Set(
        existingResult.rows.map((r) => r.transaction_hash),
      );

      const created: { id: string; transactionHash: string }[] = [];
      const duplicatesSkipped: string[] = [];

      for (const tx of txWithHash) {
        if (existingHashes.has(tx.hash)) {
          duplicatesSkipped.push(tx.hash);
          continue;
        }

        const id = generateId("btx");
        const matchStatus = tx.suggestedCoaAccountId ? "suggested" : "unmatched";

        try {
          await client.query(
            `INSERT INTO bank_transactions (
              id, financial_account_id, statement_import_id,
              client_id, accounting_firm_id,
              transaction_date, value_date, raw_description, clean_description,
              reference, transaction_type, amount, balance_after,
              category, payee_name, suggested_coa_account_id,
              match_confidence, ai_metadata,
              transaction_hash, status, match_status,
              created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
              $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW()
            )`,
            [
              id,
              args.financialAccountId,
              args.statementImportId ?? null,
              tenant.clientId,
              tenant.accountingFirmId,
              tx.transactionDate,
              tx.valueDate ?? null,
              tx.rawDescription,
              tx.cleanDescription ?? null,
              tx.reference ?? null,
              tx.transactionType,
              tx.amount,
              tx.balanceAfter ?? null,
              tx.category ?? null,
              tx.payeeName ?? null,
              tx.suggestedCoaAccountId ?? null,
              tx.matchConfidence ?? null,
              tx.aiMetadata ? JSON.stringify(tx.aiMetadata) : null,
              tx.hash,
              "imported",
              matchStatus,
            ],
          );
          created.push({ id, transactionHash: tx.hash });
        } catch (error: unknown) {
          if (
            error instanceof Error &&
            "code" in error &&
            (error as { code: string }).code === "23505"
          ) {
            duplicatesSkipped.push(tx.hash);
          } else {
            throw error;
          }
        }
      }

      return successResponse({
        created,
        duplicatesSkipped,
        totalCreated: created.length,
        totalSkipped: duplicatesSkipped.length,
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
