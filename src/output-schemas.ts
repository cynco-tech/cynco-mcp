/**
 * Zod output schemas for MCP tool responses.
 * Uses ZodRawShape format (same as inputSchema) so the SDK can validate + convert to JSON Schema.
 */
import { z } from "zod";

// ── Shared shapes ────────────────────────────────────────────────

const paginationShape = {
  hasMore: z.boolean(),
  nextOffset: z.number().int().nullable(),
};

// ── Company Profile ──────────────────────────────────────────────

export const companyProfileOutputSchema = {
  success: z.boolean(),
  data: z.object({
    tenantType: z.enum(["client", "accounting_firm"]),
    companyName: z.string().nullable(),
    registrationNumber: z.string().nullable().optional(),
    entityType: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    fiscalYearEnd: z.string().nullable().optional(),
    jurisdiction: z.string().nullable().optional(),
    chartsOfAccounts: z.array(z.unknown()).optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Financial Summary ────────────────────────────────────────────

export const financialSummaryOutputSchema = {
  success: z.boolean(),
  data: z.object({
    currentPeriod: z.string().optional(),
    balancesByType: z.unknown().optional(),
    journalEntries: z.unknown().optional(),
    bankTransactions: z.unknown().optional(),
    accountsReceivable: z.object({
      outstandingInvoices: z.number().int(),
      totalOutstanding: z.string(),
    }).optional(),
    accountsPayable: z.object({
      outstandingBills: z.number().int(),
      totalOutstanding: z.string(),
    }).optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Chart of Accounts ────────────────────────────────────────────

export const chartOfAccountsOutputSchema = {
  success: z.boolean(),
  data: z.object({
    coaId: z.string().optional(),
    coaName: z.string().optional(),
    accounts: z.array(z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      type: z.string(),
      normalBalance: z.enum(["debit", "credit"]).optional(),
      isActive: z.boolean().optional(),
    })).optional(),
    accountCount: z.number().int().optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Customers ────────────────────────────────────────────────────

export const customersOutputSchema = {
  success: z.boolean(),
  data: z.object({
    customers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable().optional(),
      outstandingBalance: z.string().optional(),
      totalInvoices: z.number().int().optional(),
      isActive: z.boolean().optional(),
    })),
    customerCount: z.number().int(),
    ...paginationShape,
  }).optional(),
  error: z.string().optional(),
};

// ── Vendors ──────────────────────────────────────────────────────

export const vendorsOutputSchema = {
  success: z.boolean(),
  data: z.object({
    vendors: z.array(z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable().optional(),
      outstandingBalance: z.string().optional(),
      outstandingBills: z.number().int().optional(),
      isActive: z.boolean().optional(),
    })),
    vendorCount: z.number().int(),
    ...paginationShape,
  }).optional(),
  error: z.string().optional(),
};

// ── Invoices ─────────────────────────────────────────────────────

export const invoicesOutputSchema = {
  success: z.boolean(),
  data: z.object({
    invoices: z.array(z.object({
      id: z.string(),
      invoiceNumber: z.string().nullable().optional(),
      status: z.string(),
      totalAmount: z.unknown().optional(),
      paidAmount: z.unknown().optional(),
      customerName: z.string().nullable().optional(),
      dueDate: z.unknown().optional(),
    })),
    invoiceCount: z.number().int(),
    ...paginationShape,
  }).optional(),
  error: z.string().optional(),
};

// ── Bank Transactions ────────────────────────────────────────────

export const bankTransactionsOutputSchema = {
  success: z.boolean(),
  data: z.object({
    transactions: z.array(z.object({
      id: z.string(),
      date: z.string().optional(),
      description: z.string().optional(),
      amount: z.string(),
      type: z.enum(["debit", "credit"]).optional(),
      status: z.string().optional(),
    })),
    transactionCount: z.number().int(),
    ...paginationShape,
  }).optional(),
  error: z.string().optional(),
};

// ── Journal Entries ──────────────────────────────────────────────

export const journalEntriesOutputSchema = {
  success: z.boolean(),
  data: z.object({
    entries: z.array(z.object({
      id: z.string(),
      entryNumber: z.string().optional(),
      date: z.string().optional(),
      status: z.string(),
      totalDebit: z.string().optional(),
      totalCredit: z.string().optional(),
      lines: z.array(z.unknown()).optional(),
    })),
    entryCount: z.number().int(),
    ...paginationShape,
  }).optional(),
  error: z.string().optional(),
};

// ── Trial Balance ────────────────────────────────────────────────

export const trialBalanceOutputSchema = {
  success: z.boolean(),
  data: z.object({
    period: z.string().optional(),
    balances: z.array(z.object({
      accountId: z.string(),
      accountCode: z.string().optional(),
      accountName: z.string().optional(),
      debitTotal: z.string().optional(),
      creditTotal: z.string().optional(),
      closingBalance: z.string().optional(),
    })).optional(),
    totalDebits: z.string().optional(),
    totalCredits: z.string().optional(),
    isBalanced: z.boolean().optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Income Statement ─────────────────────────────────────────────

export const incomeStatementOutputSchema = {
  success: z.boolean(),
  data: z.object({
    fromPeriod: z.string().optional(),
    toPeriod: z.string().optional(),
    revenue: z.object({
      accounts: z.array(z.unknown()),
      total: z.string(),
    }).optional(),
    expenses: z.object({
      accounts: z.array(z.unknown()),
      total: z.string(),
    }).optional(),
    netIncome: z.string().optional(),
    isProfit: z.boolean().optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Balance Sheet ────────────────────────────────────────────────

const accountSectionShape = z.object({
  accounts: z.array(z.unknown()),
  total: z.string(),
});

export const balanceSheetOutputSchema = {
  success: z.boolean(),
  data: z.object({
    asOfPeriod: z.string().optional(),
    assets: accountSectionShape.optional(),
    liabilities: accountSectionShape.optional(),
    equity: accountSectionShape.optional(),
    totalLiabilitiesAndEquity: z.string().optional(),
    isBalanced: z.boolean().optional(),
    balanceDifference: z.string().optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Account Balances ─────────────────────────────────────────────

export const accountBalancesOutputSchema = {
  success: z.boolean(),
  data: z.object({
    balances: z.array(z.object({
      accountId: z.string(),
      accountCode: z.string().optional(),
      accountName: z.string().optional(),
      period: z.string().optional(),
      openingBalance: z.string().optional(),
      debitMovement: z.string().optional(),
      creditMovement: z.string().optional(),
      closingBalance: z.string().optional(),
    })).optional(),
    balanceCount: z.number().int().optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Search Accounts ──────────────────────────────────────────────

export const searchAccountsOutputSchema = {
  success: z.boolean(),
  data: z.object({
    accounts: z.array(z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      type: z.string().optional(),
      relevance: z.string().optional(),
    })),
    resultCount: z.number().int(),
  }).optional(),
  error: z.string().optional(),
};

// ── Create Invoice ───────────────────────────────────────────────

export const createInvoiceOutputSchema = {
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    invoiceNumber: z.string(),
    status: z.string(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    currency: z.string().optional(),
    lineItems: z.array(z.unknown()).optional(),
    subtotal: z.number().optional(),
    taxes: z.number().optional(),
    totalAmount: z.number().optional(),
    dueDate: z.string().nullable().optional(),
  }).optional(),
  error: z.string().optional(),
};

// ── Cash Flow Summary ────────────────────────────────────────────

export const cashFlowSummaryOutputSchema = {
  success: z.boolean(),
  data: z.object({
    months: z.array(z.object({
      month: z.string(),
      inflow: z.string().optional(),
      outflow: z.string().optional(),
      net: z.string().optional(),
    })).optional(),
    topCategories: z.array(z.unknown()).optional(),
  }).optional(),
  error: z.string().optional(),
};
