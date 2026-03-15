import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getFinancialAccountsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  includeInactive: z.boolean().optional().default(false).describe("Include inactive accounts"),
};

export async function getFinancialAccounts(args: {
  clientId?: string;
  accountingFirmId?: string;
  includeInactive?: boolean;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "fa");
    const activeFilter = args.includeInactive ? "" : "AND fa.is_active = true";

    const result = await query(
      `SELECT fa.id, fa.account_name, fa.account_type, fa.account_number,
              fa.currency, fa.current_balance, fa.is_active,
              fa.display_order, fa.opening_balance, fa.opening_balance_date,
              fa.last_statement_date, fa.last_reconciled_date,
              fi.name AS institution_name, fi.institution_type,
              fa.linked_account_id,
              la.account_code AS linked_account_code,
              la.account_name AS linked_account_name
       FROM financial_accounts fa
       LEFT JOIN financial_institutions fi ON fi.id = fa.institution_id
       LEFT JOIN accounts la ON la.id = fa.linked_account_id
       WHERE ${tw.sql} ${activeFilter}
       ORDER BY fa.display_order, fa.account_name`,
      tw.params,
    );

    return successResponse({
      accounts: result.rows.map((a) => ({
        id: a.id,
        accountName: a.account_name,
        accountType: a.account_type,
        accountNumber: a.account_number,
        currency: a.currency,
        currentBalance: a.current_balance,
        isActive: a.is_active,
        displayOrder: a.display_order,
        openingBalance: a.opening_balance,
        openingBalanceDate: a.opening_balance_date,
        lastStatementDate: a.last_statement_date,
        lastReconciledDate: a.last_reconciled_date,
        institutionName: a.institution_name,
        institutionType: a.institution_type,
        linkedAccountId: a.linked_account_id,
        linkedAccountCode: a.linked_account_code,
        linkedAccountName: a.linked_account_name,
      })),
      totalAccounts: result.rows.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
