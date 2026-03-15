import { createHash } from "node:crypto";

/**
 * Compute SHA-256 transaction hash for dedup.
 * Matches remix/app/services/bankingParsers.server.ts:620-631
 */
export function computeTransactionHash(
  accountId: string,
  transactionDate: string,
  transactionType: string,
  amount: string,
  rawDescription: string,
  reference?: string,
): string {
  // NOTE: This format must exactly match remix/app/services/bankingParsers.server.ts
  // to produce identical hashes for dedup. Do NOT change the separator or encoding
  // without migrating existing hashes in the bank_transactions table.
  const data = [
    accountId,
    transactionDate,
    transactionType,
    amount,
    rawDescription,
    reference ?? "",
  ].join("|");

  return createHash("sha256").update(data).digest("hex");
}
