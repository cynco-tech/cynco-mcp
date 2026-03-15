import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Tenant, TenantArgs } from "./utils/validation.js";
import { errorResponse } from "./utils/validation.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { log } from "./logger.js";
import type { ApiKeyRecord, ToolScope } from "./auth.js";
import { checkScope } from "./auth.js";
import { recordToolExecution } from "./metrics.js";

// ── Existing tools ──────────────────────────────────────────────
import { getChartOfAccountsSchema, getChartOfAccounts } from "./tools/get-chart-of-accounts.js";
import { getCategorizationRulesSchema, getCategorizationRules } from "./tools/get-categorization-rules.js";
import { getAccountBalancesSchema, getAccountBalances } from "./tools/get-account-balances.js";
import { getFinancialAccountsSchema, getFinancialAccounts } from "./tools/get-financial-accounts.js";
import { getBankTransactionsSchema, getBankTransactions } from "./tools/get-bank-transactions.js";
import { getJournalEntriesSchema, getJournalEntries } from "./tools/get-journal-entries.js";
import { createBankTransactionsSchema, createBankTransactions } from "./tools/create-bank-transactions.js";
import { createJournalEntriesSchema, createJournalEntries } from "./tools/create-journal-entries.js";
import { getGeneralLedgerSchema, getGeneralLedger } from "./tools/get-general-ledger.js";
import { getTrialBalanceSchema, getTrialBalance } from "./tools/get-trial-balance.js";
import { updateJournalEntryStatusSchema, updateJournalEntryStatus } from "./tools/update-journal-entry-status.js";
import { updateBankTransactionStatusSchema, updateBankTransactionStatus } from "./tools/update-bank-transaction-status.js";
import { postBankTransactionsSchema, postBankTransactions } from "./tools/post-bank-transactions.js";
import { getVendorAgingSchema, getVendorAging } from "./tools/get-vendor-aging.js";
import { getCustomerAgingSchema, getCustomerAging } from "./tools/get-customer-aging.js";
import { createCategorizationRuleSchema, createCategorizationRule } from "./tools/create-categorization-rule.js";
import { updateCategorizationRuleSchema, updateCategorizationRule } from "./tools/update-categorization-rule.js";
import { getCashFlowSummarySchema, getCashFlowSummary } from "./tools/get-cash-flow-summary.js";
import { closePeriodSchema, closePeriod } from "./tools/close-period.js";
import { reopenPeriodSchema, reopenPeriod } from "./tools/reopen-period.js";
import { searchAccountsSchema, searchAccounts } from "./tools/search-accounts.js";
import { createJournalEntryTemplateSchema, createJournalEntryTemplate } from "./tools/create-journal-entry-template.js";
import { applyJournalEntryTemplateSchema, applyJournalEntryTemplate } from "./tools/apply-journal-entry-template.js";
import { getJournalEntryTemplatesSchema, getJournalEntryTemplates } from "./tools/get-journal-entry-templates.js";
import { getIncomeStatementSchema, getIncomeStatement } from "./tools/get-income-statement.js";
import { getBalanceSheetSchema, getBalanceSheet } from "./tools/get-balance-sheet.js";
import { reconcileAccountsSchema, reconcileAccounts } from "./tools/reconcile-accounts.js";
import { getPeriodStatusSchema, getPeriodStatus } from "./tools/get-period-status.js";
import { getReconciliationStatusSchema, getReconciliationStatus } from "./tools/get-reconciliation-status.js";
import { getAccountActivitySchema, getAccountActivity } from "./tools/get-account-activity.js";
import { searchJournalEntriesSchema, searchJournalEntries } from "./tools/search-journal-entries.js";
import { searchBankTransactionsSchema, searchBankTransactions } from "./tools/search-bank-transactions.js";
import { getFinancialSummarySchema, getFinancialSummary } from "./tools/get-financial-summary.js";
import { getInvoicesSchema, getInvoices } from "./tools/get-invoices.js";
import { getCreditDebitNotesSchema, getCreditDebitNotes } from "./tools/get-credit-debit-notes.js";
import { getCustomersSchema, getCustomers } from "./tools/get-customers.js";
import { getCustomerStatementSchema, getCustomerStatement } from "./tools/get-customer-statement.js";
import { getInvoiceAgingDetailSchema, getInvoiceAgingDetail } from "./tools/get-invoice-aging-detail.js";
import { getCompanyProfileSchema, getCompanyProfile } from "./tools/get-company-profile.js";
import { searchSchemaSchema, searchSchema } from "./tools/search-schema.js";
import { executeQuerySchema, executeQuery } from "./tools/execute-query.js";

// ── New tools ───────────────────────────────────────────────────
import { getVendorsSchema, getVendors } from "./tools/get-vendors.js";
import { getVendorStatementSchema, getVendorStatement } from "./tools/get-vendor-statement.js";
import { createInvoiceSchema, createInvoice } from "./tools/create-invoice.js";
import { updateInvoiceStatusSchema, updateInvoiceStatus } from "./tools/update-invoice-status.js";
import { recordPaymentSchema, recordPayment } from "./tools/record-payment.js";
import { getPaymentsSchema, getPayments } from "./tools/get-payments.js";
import { getPurchaseOrdersSchema, getPurchaseOrders } from "./tools/get-purchase-orders.js";
import { getBillsSchema, getBills } from "./tools/get-bills.js";
import { getQuotationsSchema, getQuotations } from "./tools/get-quotations.js";
import { getRecurringInvoicesSchema, getRecurringInvoices } from "./tools/get-recurring-invoices.js";
import { getTagsSchema, getTags } from "./tools/get-tags.js";

/**
 * Wrap a tool handler to auto-inject tenant, check scopes, and log execution.
 * In HTTP mode, the API key determines the tenant — tool params are ignored.
 * In stdio mode (no authTenant), the handler runs with whatever params the caller provides.
 */
function withTenant<T extends TenantArgs>(
  toolName: string,
  handler: (args: T) => Promise<CallToolResult>,
  authTenant?: Tenant,
  authRecord?: ApiKeyRecord,
  requiredScope?: ToolScope,
): (args: T) => Promise<CallToolResult> {
  return async (args: T) => {
    // Scope enforcement (HTTP mode only)
    if (authRecord && requiredScope) {
      if (!checkScope(authRecord, requiredScope)) {
        log.warn("Scope denied", {
          tool: toolName,
          required: requiredScope,
          scopes: authRecord.scopes,
          tenant: authTenant?.value,
        });
        return errorResponse(
          `Insufficient permissions: this API key requires "${requiredScope}" scope to use ${toolName}.`,
        );
      }
    }

    // Tenant injection (HTTP mode)
    if (authTenant) {
      if (authTenant.column === "client_id") {
        args.clientId = authTenant.value;
        args.accountingFirmId = undefined;
      } else {
        args.accountingFirmId = authTenant.value;
        args.clientId = undefined;
      }
    }

    // Execute with timing + logging
    const startTime = Date.now();
    try {
      const result = await handler(args);
      const durationMs = Date.now() - startTime;
      const success = !result.isError;
      const logFn = success ? log.info.bind(log) : log.error.bind(log);
      logFn("Tool executed", {
        tool: toolName,
        durationMs,
        success,
        tenant: authTenant?.value,
      });
      recordToolExecution(toolName, success, durationMs);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      log.error("Tool failed", {
        tool: toolName,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
        tenant: authTenant?.value,
      });
      recordToolExecution(toolName, false, durationMs);
      throw error;
    }
  };
}

/**
 * Strip clientId/accountingFirmId from schemas in HTTP mode.
 * When the API key determines the tenant, these fields are auto-injected
 * and should not be visible to the LLM to reduce confusion.
 */
function stripTenantFields<T extends Record<string, unknown>>(schema: T, isHttpMode: boolean): T {
  if (!isHttpMode) return schema;
  const { clientId, accountingFirmId, ...rest } = schema;
  return rest as T;
}

/**
 * Create and configure the MCP server with all tools, prompts, and resources.
 *
 * @param authTenant - If provided (HTTP mode), auto-injects tenant into all tool calls.
 *                     If undefined (stdio mode), tools require explicit tenant params.
 * @param authRecord - The authenticated API key record (HTTP mode only), for scope checks.
 */
export function createServer(authTenant?: Tenant, authRecord?: ApiKeyRecord): McpServer {
  const baseUrl = process.env.MCP_PUBLIC_URL || "https://mcp-stegona.cynco.io";
  const isHttp = !!authTenant;
  const server = new McpServer({
    name: "cynco-accounting",
    version: "2.0.0",
    icons: [
      {
        src: `${baseUrl}/icon.png`,
        mimeType: "image/png",
        sizes: ["128x128"],
      },
    ],
  });

  // Helpers to wrap handlers with tenant injection + scope enforcement
  const r = <T extends TenantArgs>(name: string, handler: (args: T) => Promise<CallToolResult>) =>
    withTenant(name, handler, authTenant, authRecord, "read");
  const w = <T extends TenantArgs>(name: string, handler: (args: T) => Promise<CallToolResult>) =>
    withTenant(name, handler, authTenant, authRecord, "write");
  const q = <T extends TenantArgs>(name: string, handler: (args: T) => Promise<CallToolResult>) =>
    withTenant(name, handler, authTenant, authRecord, "query:execute");

  // Strip tenant fields from schemas in HTTP mode
  const s = <T extends Record<string, unknown>>(schema: T) => stripTenantFields(schema, isHttp);

  // ── Orientation ──────────────────────────────────────────────

  server.registerTool("get_company_profile", {
    title: "Get Company Profile",
    description: `**Purpose:** Get the full business profile for the authenticated tenant.

**IMPORTANT:** Call this tool FIRST in any new conversation to understand who you are working with.

**Returns:** For clients: company name, registration number, address, entity type, industry, fiscal year, currency, jurisdiction, business context, charts of accounts, and managing accounting firm. For accounting firms: firm details, credentials, and list of managed clients.

**When to use:**
- Starting a new conversation — always call this first
- User asks "who am I?", "what company is this?", "show me the business details"
- You need the fiscal year, currency, or industry context

**Key trigger phrases:** "company profile", "business details", "who am I", "what company"`,
    inputSchema: s(getCompanyProfileSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_company_profile", getCompanyProfile));

  server.registerTool("get_financial_summary", {
    title: "Get Financial Summary",
    description: `**Purpose:** Dashboard-style financial overview — the bird's-eye view of a tenant's financial position.

**Returns:** Account balances grouped by type (asset, liability, equity, revenue, expense), journal entry counts by status, bank transaction counts by status, outstanding AR and AP totals.

**When to use:**
- As the second call after get_company_profile — to understand the financial landscape
- User asks "how are we doing?", "give me an overview", "financial snapshot"
- You need to decide which area to drill into next

**NOT for:** Detailed account-level data (use get_account_balances or get_account_activity). Not for specific reports (use get_income_statement, get_balance_sheet, etc.).

**Workflow:** get_company_profile → get_financial_summary → drill into specific areas

**Key trigger phrases:** "financial overview", "dashboard", "how are we doing", "summary"`,
    inputSchema: s(getFinancialSummarySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_financial_summary", getFinancialSummary));

  // ── Chart of Accounts ─────────────────────────────────────────

  server.registerTool("get_chart_of_accounts", {
    title: "Get Chart of Accounts",
    description: `**Purpose:** Get the active Chart of Accounts (COA) and its accounts for a tenant.

**Returns:** COA metadata + account list with codes, types, hierarchy, normal balance direction, and AI mapping hints.

**When to use:**
- You need account IDs for journal entries, categorization, or any tool that requires an accountId
- User asks "show me the chart of accounts", "what accounts do we have?"
- Before creating journal entries — to find the right accounts

**NOT for:** Finding a specific account by name (use search_accounts — it's faster and fuzzy). Not for account balances (use get_account_balances).

**Tips:** Use compact=true to reduce response size. Use accountType to filter (e.g. "expense").

**Key trigger phrases:** "chart of accounts", "COA", "account list", "what accounts"`,
    inputSchema: s(getChartOfAccountsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_chart_of_accounts", getChartOfAccounts));

  server.registerTool("search_accounts", {
    title: "Search Accounts",
    description: `**Purpose:** Fuzzy search for COA accounts by name, code, description, or AI mapping keywords.

**Returns:** Matched accounts ranked by relevance: exact code match > name starts with > name contains > description/keywords.

**When to use:**
- You need to find a specific account ID for categorization or journal entries
- User says "which account for rent?", "find the utilities account"
- Before create_journal_entries or create_categorization_rule — to find the right account

**NOT for:** Getting the full COA (use get_chart_of_accounts). Not for account balances (use get_account_balances).

**Key trigger phrases:** "find account", "which account for", "search accounts"`,
    inputSchema: s(searchAccountsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("search_accounts", searchAccounts));

  // ── Account Balances & Activity ───────────────────────────────

  server.registerTool("get_account_balances", {
    title: "Get Account Balances",
    description: `**Purpose:** Get period-based account balance snapshots with opening, debit, credit, closing, and YTD totals.

**Returns:** Balance records per account per period, including movements and closing status.

**When to use:**
- User asks "what's the balance of account X?", "show me this month's balances"
- Before close_period — to verify balances are correct
- Checking period movements or YTD totals

**NOT for:** Detailed transaction-level activity (use get_account_activity). Not for Trial Balance format (use get_trial_balance).

**Key trigger phrases:** "account balance", "balance for", "period balances", "YTD"`,
    inputSchema: s(getAccountBalancesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_account_balances", getAccountBalances));

  server.registerTool("get_account_activity", {
    title: "Get Account Activity",
    description: `**Purpose:** Detailed sub-ledger for a single account — every GL posting with a running balance.

**Returns:** GL postings with dates, amounts, journal entry references, descriptions, and reconciliation status.

**When to use:**
- User asks "show me all transactions in account X", "what happened in the bank account?"
- Drilling into a specific account to understand movements
- Verifying individual postings or investigating discrepancies

**NOT for:** Summary balances (use get_account_balances). Not for the full general ledger (use get_general_ledger).

**Key trigger phrases:** "account activity", "transactions in account", "sub-ledger", "account detail"`,
    inputSchema: s(getAccountActivitySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_account_activity", getAccountActivity));

  // ── Financial Accounts (Banks) ────────────────────────────────

  server.registerTool("get_financial_accounts", {
    title: "Get Financial Accounts",
    description: `**Purpose:** Get bank accounts, credit cards, and other financial accounts for a tenant.

**Returns:** Account details, linked COA accounts, institution info, and current balances.

**When to use:**
- You need a financialAccountId for create_bank_transactions
- User asks "what bank accounts do we have?", "show me our accounts"
- Before importing bank transactions — to find the right target account

**NOT for:** COA accounts (use get_chart_of_accounts). Not for bank transactions (use get_bank_transactions).

**Key trigger phrases:** "bank accounts", "financial accounts", "which account to import into"`,
    inputSchema: s(getFinancialAccountsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_financial_accounts", getFinancialAccounts));

  // ── Bank Transactions ─────────────────────────────────────────

  server.registerTool("get_bank_transactions", {
    title: "List Bank Transactions",
    description: `**Purpose:** List bank transactions for a tenant with filtering and pagination.

**Returns:** Transactions with dates, amounts, descriptions, categorization status, and GL links.

**When to use:**
- User asks "show me recent transactions", "what came in this month?"
- Reviewing imported transactions, checking categorization status
- After create_bank_transactions — to verify the import

**NOT for:** Searching by keyword (use search_bank_transactions). Not for importing (use create_bank_transactions). Not for cash flow analysis (use get_cash_flow_summary).

**Key trigger phrases:** "bank transactions", "recent transactions", "show transactions"`,
    inputSchema: s(getBankTransactionsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_bank_transactions", getBankTransactions));

  server.registerTool("search_bank_transactions", {
    title: "Search Bank Transactions",
    description: `**Purpose:** Search bank transactions by description, payee, category, or reference number.

**Returns:** Matching transactions with relevance ranking, amounts, and status.

**When to use:**
- User asks "find the payment to X", "search for transactions matching Y"
- Looking for a specific transaction by keyword

**NOT for:** Listing all transactions (use get_bank_transactions). Not for categorization (use update_bank_transaction_status).

**Key trigger phrases:** "find transaction", "search transactions", "payment to"`,
    inputSchema: s(searchBankTransactionsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("search_bank_transactions", searchBankTransactions));

  server.registerTool("create_bank_transactions", {
    title: "Import Bank Transactions",
    description: `**Purpose:** Import bank transactions into a financial account from CSV or bank API data.

**Returns:** Import summary with created count, duplicate count (auto-deduped via SHA-256), and any errors.

**Before using this tool:**
1. Get a valid financialAccountId from get_financial_accounts
2. Confirm the target account with the user

**When to use:**
- User provides bank statement data or CSV to import
- User says "import these transactions", "add bank data"

**NOT for:** Creating journal entries (use create_journal_entries). Not for recording payments (use record_payment).

**Workflow:** get_financial_accounts → confirm account → create_bank_transactions → get_bank_transactions to verify

**Key trigger phrases:** "import transactions", "upload bank statement", "add bank data"`,
    inputSchema: s(createBankTransactionsSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, w("create_bank_transactions", createBankTransactions));

  server.registerTool("update_bank_transaction_status", {
    title: "Update Bank Transaction Status",
    description: `**Purpose:** Bulk-update bank transaction status, match status, or linked journal/GL entries.

**Returns:** Update results per transaction.

**When to use:**
- Categorizing transactions (setting suggestedCoaAccountId + status to "categorized")
- Marking transactions as matched or reconciled
- Linking transactions to existing journal entries

**NOT for:** Posting to GL (use post_bank_transactions after categorization). Not for importing (use create_bank_transactions).

**Workflow:** get_bank_transactions → categorize with this tool → post_bank_transactions

**Key trigger phrases:** "categorize transaction", "update transaction status", "mark as matched"`,
    inputSchema: s(updateBankTransactionStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, w("update_bank_transaction_status", updateBankTransactionStatus));

  server.registerTool("post_bank_transactions", {
    title: "Post Bank Transactions to GL",
    description: `**Purpose:** Post categorized bank transactions to the General Ledger, creating double-entry journal entries.

**Before using this tool, you MUST:**
1. Verify transactions are categorized (status = "categorized" with a suggestedCoaAccountId)
2. Confirm the number of transactions to be posted with the user
3. Warn: "This will create journal entries for N transactions. Proceed?"

**Returns:** Created journal entries with entry numbers and GL posting details.

**When to use:**
- After categorizing bank transactions — this is the next step
- User says "post these to the GL", "create entries from bank transactions"

**NOT for:** Categorizing transactions (use update_bank_transaction_status first). Not for manual journal entries (use create_journal_entries).

**Workflow:** get_bank_transactions → update_bank_transaction_status (categorize) → confirm with user → post_bank_transactions

**Key trigger phrases:** "post to GL", "post transactions", "create entries from transactions"`,
    inputSchema: s(postBankTransactionsSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("post_bank_transactions", postBankTransactions));

  // ── Categorization Rules ──────────────────────────────────────

  server.registerTool("get_categorization_rules", {
    title: "Get Categorization Rules",
    description: `**Purpose:** List bank transaction categorization rules — pattern-matching rules that auto-categorize imported transactions.

**Returns:** Rules with patterns, match types, linked COA accounts, priority, and confidence scores.

**When to use:**
- User asks "what rules do we have?", "how are transactions categorized?"
- Before creating a new rule — to check for duplicates

**NOT for:** Categorizing individual transactions (use update_bank_transaction_status). Not for creating rules (use create_categorization_rule).

**Key trigger phrases:** "categorization rules", "auto-categorize", "transaction rules"`,
    inputSchema: s(getCategorizationRulesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_categorization_rules", getCategorizationRules));

  server.registerTool("create_categorization_rule", {
    title: "Create Categorization Rule",
    description: `**Purpose:** Create a rule that auto-categorizes future imported bank transactions by matching patterns against descriptions.

**Returns:** Created rule with ID and configuration.

**When to use:**
- User notices repeated transactions (e.g. "all GRAB transactions are transport expense")
- After categorizing a transaction manually — to automate future ones
- User says "create a rule for", "auto-categorize transactions matching"

**NOT for:** One-time categorization (use update_bank_transaction_status). Not for updating existing rules (use update_categorization_rule).

**Workflow:** search_accounts (find target COA account) → create_categorization_rule

**Key trigger phrases:** "create rule", "auto-categorize", "whenever I see transactions for"`,
    inputSchema: s(createCategorizationRuleSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("create_categorization_rule", createCategorizationRule));

  server.registerTool("update_categorization_rule", {
    title: "Update Categorization Rule",
    description: `**Purpose:** Modify or deactivate an existing categorization rule.

**Returns:** Updated rule details.

**When to use:**
- Refining a rule's pattern, COA account mapping, or priority
- Deactivating a rule that's no longer needed
- User says "change the rule for", "update categorization"

**NOT for:** Creating new rules (use create_categorization_rule). Not for deleting rules — deactivate them instead by setting isActive=false.

**Key trigger phrases:** "update rule", "change rule", "deactivate rule"`,
    inputSchema: s(updateCategorizationRuleSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, w("update_categorization_rule", updateCategorizationRule));

  // ── Journal Entries ───────────────────────────────────────────

  server.registerTool("get_journal_entries", {
    title: "List Journal Entries",
    description: `**Purpose:** List journal entries with their line items, filtered by period, status, or source.

**Returns:** Journal entries with entry numbers, dates, amounts, lines (debit/credit), status, and audit trail.

**When to use:**
- User asks "show me journal entries", "what entries were posted this month?"
- Reviewing posted entries, verifying imports, or auditing the journal
- After creating or posting entries — to verify

**NOT for:** Searching by keyword (use search_journal_entries). Not for the General Ledger view (use get_general_ledger).

**Key trigger phrases:** "journal entries", "posted entries", "show entries"`,
    inputSchema: s(getJournalEntriesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_journal_entries", getJournalEntries));

  server.registerTool("search_journal_entries", {
    title: "Search Journal Entries",
    description: `**Purpose:** Search journal entries by description, memo, entry number, document number, or vendor/customer name.

**Returns:** Matching entries with relevance ranking, status, and amounts.

**When to use:**
- User asks "find the entry for rent", "search for entry MAN-2026-0042"
- Looking for a specific journal entry by keyword

**NOT for:** Listing all entries (use get_journal_entries). Not for GL postings (use get_general_ledger).

**Key trigger phrases:** "find entry", "search entries", "entry number"`,
    inputSchema: s(searchJournalEntriesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("search_journal_entries", searchJournalEntries));

  server.registerTool("create_journal_entries", {
    title: "Create Journal Entries",
    description: `**Purpose:** Create double-entry journal entries with balanced debit/credit lines.

**Before using this tool:**
1. Get a valid coaId from get_chart_of_accounts
2. Find account IDs using search_accounts
3. Verify debits equal credits for each entry
4. You MUST have a valid createdBy user ID

**Returns:** Created entries with IDs, entry numbers, and per-entry success/error details.

**When to use:**
- User says "create a journal entry", "record an adjustment"
- Recording manual transactions, adjustments, or opening balances

**NOT for:** Posting bank transactions to GL (use post_bank_transactions). Not for recording customer/vendor payments (use record_payment).

**Workflow:** get_chart_of_accounts → search_accounts → create_journal_entries → update_journal_entry_status (post)

**Key trigger phrases:** "create entry", "journal entry", "record adjustment", "book entry"`,
    inputSchema: s(createJournalEntriesSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("create_journal_entries", createJournalEntries));

  server.registerTool("update_journal_entry_status", {
    title: "Update Journal Entry Status",
    description: `**Purpose:** Change journal entry status. Posting auto-creates GL entries.

Valid transitions: draft → posted/voided, posted → approved/voided, approved → voided.

**IMPORTANT — When voiding an entry:**
- You MUST warn the user: "Voiding is irreversible. The entry will be marked as voided and GL entries will be reversed."
- You MUST confirm with the user before proceeding
- Reference the entry by its entry number when confirming

**Returns:** Updated entry with new status and audit trail.

**When to use:**
- After create_journal_entries — to post draft entries
- User says "post this entry", "approve entry X", "void entry Y"

**NOT for:** Creating entries (use create_journal_entries). Not for editing entry content — create a new correcting entry instead.

**Workflow:** create_journal_entries → update_journal_entry_status (draft→posted) → update_journal_entry_status (posted→approved)

**Key trigger phrases:** "post entry", "approve entry", "void entry"`,
    inputSchema: s(updateJournalEntryStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("update_journal_entry_status", updateJournalEntryStatus));

  // ── Journal Entry Templates ───────────────────────────────────

  server.registerTool("get_journal_entry_templates", {
    title: "List Journal Entry Templates",
    description: `**Purpose:** List reusable journal entry templates for recurring entries.

**Returns:** Templates with line items, recurrence settings (monthly/quarterly/yearly), and last applied date.

**When to use:**
- User asks "what recurring entries do we have?", "show me templates"
- Before applying a template — to find the right one

**NOT for:** Creating templates (use create_journal_entry_template). Not for applying (use apply_journal_entry_template).

**Key trigger phrases:** "templates", "recurring entries", "show templates"`,
    inputSchema: s(getJournalEntryTemplatesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_journal_entry_templates", getJournalEntryTemplates));

  server.registerTool("create_journal_entry_template", {
    title: "Create Journal Entry Template",
    description: `**Purpose:** Create a reusable template for recurring journal entries (rent, depreciation, payroll accruals).

**Returns:** Created template with ID and configuration.

**When to use:**
- User has a recurring entry they want to automate
- User says "create a template for monthly rent", "set up recurring depreciation"

**NOT for:** One-time entries (use create_journal_entries). Not for applying existing templates (use apply_journal_entry_template).

**Workflow:** search_accounts → create_journal_entry_template → apply_journal_entry_template each period

**Key trigger phrases:** "create template", "recurring entry", "set up monthly"`,
    inputSchema: s(createJournalEntryTemplateSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("create_journal_entry_template", createJournalEntryTemplate));

  server.registerTool("apply_journal_entry_template", {
    title: "Apply Journal Entry Template",
    description: `**Purpose:** Execute a template, creating a draft journal entry for a specific date.

**Returns:** Created draft journal entry with ID and entry number.

**When to use:**
- User says "apply the rent template for March", "run the depreciation template"
- Monthly/quarterly processing of recurring entries

**NOT for:** Creating templates (use create_journal_entry_template). Not for posting the created entry (use update_journal_entry_status after this).

**Workflow:** get_journal_entry_templates → apply_journal_entry_template → update_journal_entry_status (post)

**Key trigger phrases:** "apply template", "run template", "process recurring"`,
    inputSchema: s(applyJournalEntryTemplateSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("apply_journal_entry_template", applyJournalEntryTemplate));

  // ── General Ledger & Trial Balance ────────────────────────────

  server.registerTool("get_general_ledger", {
    title: "Query General Ledger",
    description: `**Purpose:** Query the General Ledger — the complete record of all posted accounting entries.

**Returns:** GL postings with account details, amounts, running balances, journal entry references, and reconciliation status.

**When to use:**
- User asks "show me the GL", "what's posted to account X?"
- Drilling into posted transactions for a specific account or period
- Verifying postings or investigating discrepancies

**NOT for:** Summary balances (use get_account_balances). Not for a single account's detail (use get_account_activity — it's optimized for single-account drill-down). Not for Trial Balance format (use get_trial_balance).

**Key trigger phrases:** "general ledger", "GL", "posted transactions", "ledger entries"`,
    inputSchema: s(getGeneralLedgerSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_general_ledger", getGeneralLedger));

  server.registerTool("get_trial_balance", {
    title: "Get Trial Balance",
    description: `**Purpose:** Get Trial Balance snapshots — the verification report that debits equal credits.

**Returns:** TB metadata and full balance details per account (debit total, credit total, closing balance), filtered by period or balance type.

**When to use:**
- User asks "show me the trial balance", "TB for March"
- Period-end verification before closing
- Comparing preliminary vs adjusted vs final TB

**NOT for:** Individual account balances (use get_account_balances). Not for Income Statement or Balance Sheet format (use those specific tools).

**Workflow:** get_trial_balance → verify debits = credits → close_period

**Key trigger phrases:** "trial balance", "TB", "debit credit check"`,
    inputSchema: s(getTrialBalanceSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_trial_balance", getTrialBalance));

  // ── Financial Statements ──────────────────────────────────────

  server.registerTool("get_income_statement", {
    title: "Get Income Statement (P&L)",
    description: `**Purpose:** Profit & Loss report showing revenue, expenses, and net income.

**Returns:** Revenue and expense accounts with period totals, grouped by account type, with net income calculation.

**When to use:**
- User asks "P&L", "profit and loss", "how profitable are we?", "income statement"
- Financial analysis, period-end reporting
- Comparing periods for trend analysis

**NOT for:** Balance Sheet (use get_balance_sheet). Not for cash flow (use get_cash_flow_summary). Not for detailed account activity (use get_account_activity).

**Key trigger phrases:** "P&L", "income statement", "profit and loss", "profitability"`,
    inputSchema: s(getIncomeStatementSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_income_statement", getIncomeStatement));

  server.registerTool("get_balance_sheet", {
    title: "Get Balance Sheet",
    description: `**Purpose:** Balance Sheet snapshot showing assets, liabilities, and equity as of a given period.

**Returns:** Accounts grouped by type (assets, liabilities, equity) with closing balances. Checks A = L + E balance equation.

**When to use:**
- User asks "balance sheet", "what do we own?", "net worth"
- Period-end financial position assessment

**NOT for:** Income Statement (use get_income_statement). Not for detailed account activity (use get_account_activity).

**Key trigger phrases:** "balance sheet", "assets and liabilities", "financial position", "net worth"`,
    inputSchema: s(getBalanceSheetSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_balance_sheet", getBalanceSheet));

  server.registerTool("get_cash_flow_summary", {
    title: "Get Cash Flow Summary",
    description: `**Purpose:** Monthly cash flow summary derived from bank transactions.

**Returns:** Monthly inflows, outflows, and net cash flow with top spending categories. Defaults to last 12 months.

**When to use:**
- User asks "cash flow", "where is the money going?", "monthly spending"
- Analyzing spending trends or cash position over time

**NOT for:** Individual transactions (use get_bank_transactions). Not for bank account balances (use get_financial_accounts).

**Key trigger phrases:** "cash flow", "spending", "where's the money going", "inflows and outflows"`,
    inputSchema: s(getCashFlowSummarySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_cash_flow_summary", getCashFlowSummary));

  // ── Customers & AR ────────────────────────────────────────────

  server.registerTool("get_customers", {
    title: "List Customers",
    description: `**Purpose:** List customers with invoice counts, outstanding balances, and payment terms.

**Returns:** Customer details including name, email, registration number, payment terms, credit limits, and linked COA accounts.

**When to use:**
- User asks "show me customers", "who owes us?"
- Before creating an invoice — to find the customerId
- Reviewing customer portfolio

**NOT for:** Customer aging (use get_customer_aging). Not for a specific customer's transactions (use get_customer_statement).

**Key trigger phrases:** "customers", "client list", "who do we invoice"`,
    inputSchema: s(getCustomersSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_customers", getCustomers));

  server.registerTool("get_customer_statement", {
    title: "Get Customer Statement of Account",
    description: `**Purpose:** Full statement of account for a single customer — all invoices, payments, and credit/debit notes with running totals.

**Returns:** Statement with all transactions in date range, summary totals (total invoiced, paid, outstanding, credits, debits).

**When to use:**
- User asks "statement for customer X", "what does customer X owe?"
- Preparing a statement to send to a customer
- Reviewing a customer's account history

**NOT for:** All customers' aging (use get_customer_aging). Not for listing all customers (use get_customers).

**Key trigger phrases:** "customer statement", "statement of account", "what does X owe"`,
    inputSchema: s(getCustomerStatementSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_customer_statement", getCustomerStatement));

  server.registerTool("get_customer_aging", {
    title: "Get Customer Aging (AR)",
    description: `**Purpose:** Accounts Receivable aging report — outstanding invoices grouped by customer with aging buckets.

**Returns:** Per-customer totals in buckets: current, 1-30, 31-60, 61-90, and 90+ days past due.

**When to use:**
- User asks "who owes us?", "AR aging", "overdue invoices"
- Collections review, cash flow planning
- Identifying customers with overdue payments

**NOT for:** Individual invoice details (use get_invoice_aging_detail for invoice-level granularity). Not for vendor payables (use get_vendor_aging).

**Key trigger phrases:** "AR aging", "customer aging", "who owes us", "overdue receivables"`,
    inputSchema: s(getCustomerAgingSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_customer_aging", getCustomerAging));

  server.registerTool("get_invoice_aging_detail", {
    title: "Get Invoice Aging Detail",
    description: `**Purpose:** Invoice-level aging report — each outstanding invoice with days past due and aging bucket.

**Returns:** Individual invoices with customer name, amount, due date, days past due, and bucket (current, 1-30, 31-60, 61-90, over-90).

**When to use:**
- User asks "which invoices are overdue?", "show me late invoices"
- Drilling into a specific customer's overdue invoices
- More granular than get_customer_aging (which groups by customer)

**NOT for:** Customer-level aging summary (use get_customer_aging). Not for all invoices (use get_invoices).

**Key trigger phrases:** "overdue invoices", "invoice aging", "late invoices", "which invoices are past due"`,
    inputSchema: s(getInvoiceAgingDetailSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_invoice_aging_detail", getInvoiceAgingDetail));

  // ── Invoices ──────────────────────────────────────────────────

  server.registerTool("get_invoices", {
    title: "List Invoices",
    description: `**Purpose:** List invoices with line items, payment amounts, and outstanding balances.

**Returns:** Invoices with status, amounts, line items, customer info, due dates, and payment tracking.

**When to use:**
- User asks "show me invoices", "recent invoices", "draft invoices"
- Reviewing invoice status or payment tracking

**NOT for:** Creating invoices (use create_invoice). Not for aging analysis (use get_customer_aging or get_invoice_aging_detail).

**Key trigger phrases:** "invoices", "show invoices", "invoice list"`,
    inputSchema: s(getInvoicesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_invoices", getInvoices));

  server.registerTool("create_invoice", {
    title: "Create Invoice",
    description: `**Purpose:** Create a new invoice for a customer with line items, auto-calculated totals, and auto-generated invoice number.

**Before using this tool:**
1. Get a valid customerId from get_customers
2. Confirm line items and amounts with the user
3. You MUST have a valid createdBy user ID

**Returns:** Created invoice with ID, invoice number, calculated totals, and status (draft).

**When to use:**
- User says "create an invoice", "invoice customer X for Y"
- Billing a customer for goods or services

**NOT for:** Quotations (use get_quotations — quotation creation coming soon). Not for recording received payments (use record_payment).

**Workflow:** get_customers → confirm details → create_invoice → update_invoice_status (finalize) → record_payment (when paid)

**Key trigger phrases:** "create invoice", "invoice for", "bill customer", "new invoice"`,
    inputSchema: s(createInvoiceSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("create_invoice", createInvoice));

  server.registerTool("update_invoice_status", {
    title: "Update Invoice Status",
    description: `**Purpose:** Change an invoice's status (e.g. finalize a draft, mark as paid, void).

Valid transitions: draft → finalized/void, finalized → paid/partially_paid/overdue/void, partially_paid → paid/void, overdue → paid/partially_paid/void.

**IMPORTANT — When voiding an invoice:**
- You MUST warn the user: "Voiding invoice [number] is irreversible."
- You MUST confirm with the user before proceeding
- Reference the invoice by its number, not ID

**Returns:** Updated invoice with new status.

**When to use:**
- After create_invoice — to finalize the draft
- When payment is received — to mark as paid
- User says "finalize invoice", "mark as paid", "void invoice"

**NOT for:** Creating invoices (use create_invoice). Not for recording the payment itself (use record_payment).

**Workflow:** create_invoice → update_invoice_status (finalize) → send to customer → record_payment → update_invoice_status (paid)

**Key trigger phrases:** "finalize invoice", "mark invoice paid", "void invoice"`,
    inputSchema: s(updateInvoiceStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("update_invoice_status", updateInvoiceStatus));

  server.registerTool("get_credit_debit_notes", {
    title: "List Credit/Debit Notes",
    description: `**Purpose:** List credit notes (reduce amount owed) and debit notes (increase amount owed).

**Returns:** Notes with type, amounts, applications, refund status, reasons, and linked invoices.

**When to use:**
- User asks "show me credit notes", "any debit notes?"
- Reviewing adjustments to customer accounts

**NOT for:** Creating notes (not yet available via MCP). Not for customer statements (use get_customer_statement — it includes notes).

**Key trigger phrases:** "credit notes", "debit notes", "adjustments"`,
    inputSchema: s(getCreditDebitNotesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_credit_debit_notes", getCreditDebitNotes));

  // ── Vendors & AP ──────────────────────────────────────────────

  server.registerTool("get_vendors", {
    title: "List Vendors",
    description: `**Purpose:** List vendors (suppliers) with outstanding bill counts and payment details.

**Returns:** Vendor details including name, email, payment terms, preferred payment method, bank details, and default COA accounts.

**When to use:**
- User asks "show me vendors", "who do we pay?"
- Before creating a bill or recording a payment — to find the vendorId
- Reviewing the vendor portfolio

**NOT for:** Vendor aging (use get_vendor_aging). Not for a specific vendor's transactions (use get_vendor_statement).

**Key trigger phrases:** "vendors", "suppliers", "who do we pay", "vendor list"`,
    inputSchema: s(getVendorsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_vendors", getVendors));

  server.registerTool("get_vendor_statement", {
    title: "Get Vendor Statement",
    description: `**Purpose:** Full statement for a single vendor — all bills, payments, and outstanding amounts.

**Returns:** Statement with bills, payments, and summary (total billed, paid, outstanding).

**When to use:**
- User asks "statement for vendor X", "how much do we owe vendor X?"
- Reviewing a vendor's account history
- Preparing for vendor payment run

**NOT for:** All vendors' aging (use get_vendor_aging). Not for listing all vendors (use get_vendors).

**Key trigger phrases:** "vendor statement", "how much do we owe", "vendor account"`,
    inputSchema: s(getVendorStatementSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_vendor_statement", getVendorStatement));

  server.registerTool("get_vendor_aging", {
    title: "Get Vendor Aging (AP)",
    description: `**Purpose:** Accounts Payable aging report — outstanding bills grouped by vendor with aging buckets.

**Returns:** Per-vendor totals in buckets: current, 1-30, 31-60, 61-90, and 90+ days past due.

**When to use:**
- User asks "who do we owe?", "AP aging", "overdue bills"
- Payment planning, vendor management
- Identifying overdue payables

**NOT for:** Individual bill details (use get_bills). Not for customer receivables (use get_customer_aging).

**Key trigger phrases:** "AP aging", "vendor aging", "who do we owe", "overdue payables"`,
    inputSchema: s(getVendorAgingSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_vendor_aging", getVendorAging));

  // ── Bills ─────────────────────────────────────────────────────

  server.registerTool("get_bills", {
    title: "List Bills",
    description: `**Purpose:** List bills (vendor invoices/payables) with amounts, payment status, and vendor details.

**Returns:** Bills with vendor info, amounts (subtotal, tax, total, paid, outstanding), line items, status, and due dates.

**When to use:**
- User asks "show me bills", "what bills are pending?", "unpaid bills"
- Reviewing payables or planning payments

**NOT for:** Vendor aging summary (use get_vendor_aging). Not for vendor-specific history (use get_vendor_statement).

**Key trigger phrases:** "bills", "payables", "vendor invoices", "pending bills"`,
    inputSchema: s(getBillsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_bills", getBills));

  // ── Purchase Orders ───────────────────────────────────────────

  server.registerTool("get_purchase_orders", {
    title: "List Purchase Orders",
    description: `**Purpose:** List purchase orders (POs) with vendor details, amounts, and approval status.

**Returns:** POs with vendor info, line items, amounts, status (draft/pending_approval/approved/received/closed), and delivery dates.

**When to use:**
- User asks "show me POs", "pending purchase orders", "what have we ordered?"
- Tracking procurement or checking approval status

**NOT for:** Bills (use get_bills — bills are for received goods). Not for vendor details (use get_vendors).

**Key trigger phrases:** "purchase orders", "POs", "what have we ordered", "procurement"`,
    inputSchema: s(getPurchaseOrdersSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_purchase_orders", getPurchaseOrders));

  // ── Payments ──────────────────────────────────────────────────

  server.registerTool("get_payments", {
    title: "List Payments",
    description: `**Purpose:** List all recorded payments — both inbound (from customers) and outbound (to vendors).

**Returns:** Payments with entity details, amounts, dates, payment methods, reconciliation status, and linked invoices/bills.

**When to use:**
- User asks "show me payments", "recent payments", "what did we pay?"
- Reviewing payment history or reconciliation status

**NOT for:** Recording new payments (use record_payment). Not for invoice payment tracking (use get_invoices — it shows paid amounts).

**Key trigger phrases:** "payments", "payment history", "what did we pay", "what came in"`,
    inputSchema: s(getPaymentsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_payments", getPayments));

  server.registerTool("record_payment", {
    title: "Record Payment",
    description: `**Purpose:** Record a payment received from a customer or made to a vendor.

**Before using this tool:**
1. Confirm the amount, entity, and date with the user
2. If linking to an invoice/bill, verify the outstanding balance

**Returns:** Created payment record with ID and status.

**When to use:**
- User says "record a payment", "customer X paid Y", "we paid vendor Z"
- Recording cash receipts or vendor payments

**NOT for:** Importing bank transactions (use create_bank_transactions). Not for creating journal entries directly (use create_journal_entries).

**Workflow:** get_customers/get_vendors → confirm details → record_payment → update_invoice_status (if fully paid)

**Key trigger phrases:** "record payment", "received payment", "paid vendor", "customer paid"`,
    inputSchema: s(recordPaymentSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("record_payment", recordPayment));

  // ── Quotations ────────────────────────────────────────────────

  server.registerTool("get_quotations", {
    title: "List Quotations",
    description: `**Purpose:** List quotations (quotes/proposals) sent to customers.

**Returns:** Quotations with customer info, line items, amounts, status (draft/sent/accepted/rejected/expired/converted), and conversion tracking.

**When to use:**
- User asks "show me quotations", "pending quotes", "accepted proposals"
- Tracking quote-to-invoice conversion pipeline

**NOT for:** Invoices (use get_invoices). Not for creating quotations (not yet available via MCP).

**Key trigger phrases:** "quotations", "quotes", "proposals", "pending quotes"`,
    inputSchema: s(getQuotationsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_quotations", getQuotations));

  // ── Recurring Invoices ────────────────────────────────────────

  server.registerTool("get_recurring_invoices", {
    title: "List Recurring Invoice Templates",
    description: `**Purpose:** List recurring invoice templates — automated invoice generation schedules.

**Returns:** Templates with frequency, schedule, customer info, line items, next generation date, and total generated count.

**When to use:**
- User asks "recurring invoices", "auto-invoicing", "what invoices are scheduled?"
- Reviewing subscription billing or retainer schedules

**NOT for:** Regular invoices (use get_invoices). Not for journal entry templates (use get_journal_entry_templates).

**Key trigger phrases:** "recurring invoices", "subscription billing", "auto-invoicing", "scheduled invoices"`,
    inputSchema: s(getRecurringInvoicesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_recurring_invoices", getRecurringInvoices));

  // ── Tags ──────────────────────────────────────────────────────

  server.registerTool("get_tags", {
    title: "List Tags",
    description: `**Purpose:** List tags used to organize and categorize entities (vendors, customers, invoices, bills, etc.).

**Returns:** Tags with names, colors, descriptions, and usage counts.

**When to use:**
- User asks "what tags do we have?", "show me tags"
- Reviewing organizational taxonomy

**Key trigger phrases:** "tags", "labels", "categories"`,
    inputSchema: s(getTagsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_tags", getTags));

  // ── Period Management ─────────────────────────────────────────

  server.registerTool("get_period_status", {
    title: "Get Period Status",
    description: `**Purpose:** Overview of all accounting periods with open/closed status and readiness indicators.

**Returns:** Periods with open/closed status, transaction counts, draft JE counts, and whether they're ready to close.

**When to use:**
- Before close_period — to see which periods are ready
- User asks "which periods are open?", "what needs closing?"
- Month-end workflow planning

**NOT for:** Closing periods (use close_period). Not for balance details (use get_account_balances).

**Key trigger phrases:** "period status", "which periods are open", "ready to close"`,
    inputSchema: s(getPeriodStatusSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_period_status", getPeriodStatus));

  server.registerTool("close_period", {
    title: "Close Accounting Period",
    description: `**Purpose:** Lock an accounting period, preventing new journal entries from being posted to it.

**IMPORTANT — Before using this tool, you MUST:**
1. Run get_period_status to show the user which periods are open
2. Run get_journal_entries with status="draft" for this period
3. Warn the user if draft JEs exist — they will be blocked from posting after close
4. Confirm with the user: "Are you sure you want to close period [YYYY-MM]? This will prevent any new entries."

**Returns:** Close confirmation with audit details.

**When to use:**
- Month-end close process
- User says "close the month", "lock January", "close period"

**NOT for:** Checking period status (use get_period_status). Not for reopening (use reopen_period).

**Workflow:** get_period_status → get_journal_entries (check drafts) → get_trial_balance → confirm with user → close_period

**Key trigger phrases:** "close period", "close the month", "lock period", "month-end close"`,
    inputSchema: s(closePeriodSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("close_period", closePeriod));

  server.registerTool("reopen_period", {
    title: "Reopen Accounting Period",
    description: `**Purpose:** Reopen a previously closed accounting period to allow corrections.

**IMPORTANT — Before using this tool, you MUST:**
1. Warn the user: "Reopening a period allows new entries and is recorded in the audit trail."
2. Confirm with the user and ask for the reason
3. Note: Cannot reopen if a later period is also closed — must reopen later periods first

**Returns:** Reopen confirmation with audit trail.

**When to use:**
- User needs to make corrections to a closed period
- User says "reopen January", "unlock the period"

**NOT for:** Closing periods (use close_period). Not for checking status (use get_period_status).

**Key trigger phrases:** "reopen period", "unlock period", "reopen the month"`,
    inputSchema: s(reopenPeriodSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, w("reopen_period", reopenPeriod));

  // ── Reconciliation ────────────────────────────────────────────

  server.registerTool("get_reconciliation_status", {
    title: "Get Reconciliation Status",
    description: `**Purpose:** Bank reconciliation summary — reconciled vs unreconciled GL entries per account.

**Returns:** Per-account reconciliation counts and amounts (reconciled, unreconciled, total).

**When to use:**
- User asks "reconciliation status", "how much is reconciled?"
- Before month-end close — to check reconciliation progress

**NOT for:** Reconciling entries (use reconcile_accounts). Not for bank transactions (use get_bank_transactions).

**Key trigger phrases:** "reconciliation status", "how much reconciled", "unreconciled entries"`,
    inputSchema: s(getReconciliationStatusSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, r("get_reconciliation_status", getReconciliationStatus));

  server.registerTool("reconcile_accounts", {
    title: "Reconcile GL Entries",
    description: `**Purpose:** Mark General Ledger entries as reconciled (matched to bank statement).

**Before using this tool:**
1. Use get_general_ledger with isReconciled=false to find unreconciled entries
2. Match entries against bank statement data
3. Confirm the entries to reconcile with the user

**Returns:** Reconciliation results per entry.

**When to use:**
- Bank reconciliation process — matching GL to bank statement
- User says "reconcile these entries", "mark as reconciled"

**NOT for:** Checking reconciliation status (use get_reconciliation_status). Not for bank transactions (use update_bank_transaction_status).

**Workflow:** get_general_ledger (unreconciled) → match to bank statement → confirm → reconcile_accounts

**Key trigger phrases:** "reconcile", "mark reconciled", "bank reconciliation"`,
    inputSchema: s(reconcileAccountsSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, w("reconcile_accounts", reconcileAccounts));

  // ── Code Mode (Advanced) ──────────────────────────────────────

  server.registerTool("search_schema", {
    title: "Search Database Schema",
    description: `**Purpose:** Discover tables, columns, types, and foreign key relationships in the database.

**Returns:** Schema metadata matching your search — table names, column definitions, types, and relationships.

**When to use:**
- Before execute_query — you MUST use this first to discover available tables and columns
- User asks "what tables exist?", "what columns does invoices have?"

**NOT for:** Running queries (use execute_query after this). Not for application-level data (use the typed tools instead).

**Workflow:** search_schema → understand structure → execute_query

**Key trigger phrases:** "database schema", "what tables", "table structure"`,
    inputSchema: s(searchSchemaSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, searchSchema);

  server.registerTool("execute_query", {
    title: "Execute SQL Query",
    description: `**Purpose:** Run a read-only SQL SELECT query against the accounting database. Your escape hatch for questions the typed tools can't answer.

**IMPORTANT — Before using this tool:**
1. You MUST use search_schema first to discover tables and columns — never guess
2. You MUST show the query to the user before executing
3. Use $TENANT_FILTER as the FIRST condition after WHERE (auto-replaced with tenant filter)

**Security constraints:** No CTEs (WITH), no OR (use IN() instead), no UNION. $TENANT_FILTER must appear exactly once, immediately after WHERE. Requires explicit "query:execute" scope on the API key. Max 200 rows.

**When to use:**
- The typed tools can't answer the question (e.g. complex joins, aggregations)
- User needs a custom report not covered by existing tools

**NOT for:** Standard reports (use get_income_statement, get_balance_sheet, etc.). Not for writes — this is read-only.

**Key tables:** journal_entries, journal_entry_lines, accounts, chart_of_accounts, general_ledger, account_balances, invoices, bills, bank_transactions, customers, vendors, financial_accounts, credit_debit_notes, client_details, business_context, purchase_orders, quotations, payments_unified, tags, entity_tags, recurring_invoice_templates, fixed_assets

**Key trigger phrases:** "custom query", "SQL", "run a query", "complex report"`,
    inputSchema: s(executeQuerySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, q("execute_query", executeQuery));

  // ── Prompts ─────────────────────────────────────────────────────

  registerPrompts(server);

  // ── Resources ───────────────────────────────────────────────────

  registerResources(server);

  return server;
}
