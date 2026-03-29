import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Tenant, TenantArgs } from "./utils/validation.js";
import { errorResponse } from "./utils/validation.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerApps } from "./apps.js";
import { log } from "./logger.js";
import type { ApiKeyRecord, ToolScope } from "./auth.js";
import { checkScope } from "./auth.js";
import { getToolScope } from "./scope-map.js";
import { recordToolExecution } from "./metrics.js";
// outputSchema + structuredContent removed for MCP spec compliance.
// The official schema.ts (2025-03-26) does not define outputSchema on Tool
// or structuredContent on CallToolResult. Claude.ai rejects responses
// containing these non-standard fields with "Error occurred during tool execution".
// See: https://github.com/modelcontextprotocol/specification/blob/main/schema/2025-03-26/schema.ts

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

// ── Phase 3: CRUD tools ─────────────────────────────────────────
import { createCustomerSchema, createCustomer } from "./tools/create-customer.js";
import { updateCustomerSchema, updateCustomer } from "./tools/update-customer.js";
import { deleteCustomerSchema, deleteCustomer } from "./tools/delete-customer.js";
import { createVendorSchema, createVendor } from "./tools/create-vendor.js";
import { updateVendorSchema, updateVendor } from "./tools/update-vendor.js";
import { deleteVendorSchema, deleteVendor } from "./tools/delete-vendor.js";
import { getItemsSchema, getItems } from "./tools/get-items.js";
import { createItemSchema, createItem } from "./tools/create-item.js";
import { updateItemSchema, updateItem } from "./tools/update-item.js";
import { deleteItemSchema, deleteItem } from "./tools/delete-item.js";
import { createQuotationSchema, createQuotation } from "./tools/create-quotation.js";
import { updateQuotationStatusSchema, updateQuotationStatus } from "./tools/update-quotation-status.js";
import { createPurchaseOrderSchema, createPurchaseOrder } from "./tools/create-purchase-order.js";
import { updatePurchaseOrderStatusSchema, updatePurchaseOrderStatus } from "./tools/update-purchase-order-status.js";
import { createBillSchema, createBill } from "./tools/create-bill.js";
import { updateBillStatusSchema, updateBillStatus } from "./tools/update-bill-status.js";
import { createRecurringInvoiceSchema, createRecurringInvoice } from "./tools/create-recurring-invoice.js";
import { updateRecurringInvoiceSchema, updateRecurringInvoice } from "./tools/update-recurring-invoice.js";
import { deleteRecurringInvoiceSchema, deleteRecurringInvoice } from "./tools/delete-recurring-invoice.js";
import { createCreditDebitNoteSchema, createCreditDebitNote } from "./tools/create-credit-debit-note.js";
import { createTagSchema, createTag } from "./tools/create-tag.js";
import { updateTagSchema, updateTag } from "./tools/update-tag.js";
import { deleteTagSchema, deleteTag } from "./tools/delete-tag.js";
import { assignTagSchema, assignTag } from "./tools/assign-tag.js";
import { createAccountSchema, createAccount } from "./tools/create-account.js";
import { updateAccountSchema, updateAccount } from "./tools/update-account.js";

// ── Phase 4: Feature modules ────────────────────────────────────
import { getAgreementsSchema, getAgreements } from "./tools/get-agreements.js";
import { getAgreementDetailSchema, getAgreementDetail } from "./tools/get-agreement-detail.js";
import { createAgreementSchema, createAgreement } from "./tools/create-agreement.js";
import { updateAgreementStatusSchema, updateAgreementStatus } from "./tools/update-agreement-status.js";
import { getClausesSchema, getClauses } from "./tools/get-clauses.js";
import { getContractTemplatesSchema, getContractTemplates } from "./tools/get-contract-templates.js";
import { getBillingSchedulesSchema, getBillingSchedules } from "./tools/get-billing-schedules.js";
import { createBillingScheduleSchema, createBillingSchedule } from "./tools/create-billing-schedule.js";
import { getDataroomFoldersSchema, getDataroomFolders } from "./tools/get-dataroom-folders.js";
import { getDataroomFilesSchema, getDataroomFiles } from "./tools/get-dataroom-files.js";
import { getDataroomFileDetailSchema, getDataroomFileDetail } from "./tools/get-dataroom-file-detail.js";
import { searchDataroomSchema, searchDataroom } from "./tools/search-dataroom.js";
import { getDataroomActivitySchema, getDataroomActivity } from "./tools/get-dataroom-activity.js";
import { createDataroomFolderSchema, createDataroomFolder } from "./tools/create-dataroom-folder.js";
import { getFixedAssetsSchema, getFixedAssets } from "./tools/get-fixed-assets.js";
import { getAssetDetailSchema, getAssetDetail } from "./tools/get-asset-detail.js";
import { createFixedAssetSchema, createFixedAsset } from "./tools/create-fixed-asset.js";
import { updateAssetStatusSchema, updateAssetStatus } from "./tools/update-asset-status.js";
import { getAssetCategoriesSchema, getAssetCategories } from "./tools/get-asset-categories.js";
import { getDepreciationScheduleSchema, getDepreciationSchedule } from "./tools/get-depreciation-schedule.js";
import { getAssetSummarySchema, getAssetSummary } from "./tools/get-asset-summary.js";
import { getTeamMembersSchema, getTeamMembers } from "./tools/get-team-members.js";
import { getStaffInvitationsSchema, getStaffInvitations } from "./tools/get-staff-invitations.js";
import { getOrganizationLinkRequestsSchema, getOrganizationLinkRequests } from "./tools/get-organization-link-requests.js";
import { getAuditTrailSchema, getAuditTrail } from "./tools/get-audit-trail.js";
import { getEntityHistorySchema, getEntityHistory } from "./tools/get-entity-history.js";
import { getEinvoiceStatusSchema, getEinvoiceStatus } from "./tools/get-einvoice-status.js";

// ── Code Mode ────────────────────────────────────────────────
import { z } from "zod";
import type { ToolRegistryEntry } from "./code-mode/search-tools.js";
import { searchToolsSchema, createSearchToolsHandler, deriveCategory } from "./code-mode/search-tools.js";
import { executeCodeSchema, createExecuteCodeHandler } from "./code-mode/execute-code.js";
import type { SandboxToolHandler } from "./code-mode/sandbox.js";

const TOOL_TIMEOUT_MS = parseInt(process.env.MCP_TOOL_TIMEOUT_MS || "30000", 10);

/**
 * Wrap a tool handler to auto-inject tenant, check scopes, enforce timeout, and log execution.
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

    // Execute with timing + logging + timeout
    const startTime = Date.now();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<CallToolResult>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Tool "${toolName}" timed out after ${TOOL_TIMEOUT_MS}ms`)), TOOL_TIMEOUT_MS);
      });
      const result = await Promise.race([handler(args), timeoutPromise]);
      clearTimeout(timeoutHandle);
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
      clearTimeout(timeoutHandle);
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      log.error("Tool failed", {
        tool: toolName,
        durationMs,
        error: message,
        tenant: authTenant?.value,
      });
      recordToolExecution(toolName, false, durationMs);
      return errorResponse(message);
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
      { src: `${baseUrl}/icon.png`, mimeType: "image/png", sizes: ["128x128"] },
      { src: `${baseUrl}/icon-light.png`, mimeType: "image/png", sizes: ["128x128"] },
    ],
  });

  // Code Mode registry — auto-populated by intercepting registerTool calls
  const toolHandlers = new Map<string, SandboxToolHandler>();
  const toolRegistryEntries: ToolRegistryEntry[] = [];

  // Tools excluded from Code Mode registry
  const CODE_MODE_EXCLUDED = new Set(["search_schema", "execute_query", "search_tools", "execute_code"]);

  // Intercept registerTool to capture descriptions + schemas for Code Mode registry.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _origRegisterTool = server.registerTool.bind(server) as (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: any, handler: any) => {
    if (!CODE_MODE_EXCLUDED.has(name) && config?.inputSchema) {
      const scope = getToolScope(name);
      toolRegistryEntries.push({
        name,
        description: (config.description as string) || name,
        category: deriveCategory(name, scope),
        inputSchema: config.inputSchema as Record<string, z.ZodTypeAny>,
      });
    }
    return _origRegisterTool(name, config, handler);
  };

  // Wrap handler with tenant injection + scope enforcement (scope looked up from TOOL_SCOPE_MAP)
  const t = <T extends TenantArgs>(name: string, handler: (args: T) => Promise<CallToolResult>) => {
    const scope = getToolScope(name);
    const wrapped = withTenant(name, handler, authTenant, authRecord, scope);

    // Also store handler for Code Mode sandbox proxy
    if (!CODE_MODE_EXCLUDED.has(name)) {
      toolHandlers.set(name, async (args) => {
        const result = await wrapped(args as T);
        const text = result.content?.[0]?.type === "text" ? (result.content[0] as { text: string }).text : "{}";
        try {
          return JSON.parse(text) as { success: boolean; data?: unknown; error?: string };
        } catch {
          return result.isError ? { success: false, error: text } : { success: true, data: text };
        }
      });
    }

    return wrapped;
  };

  // Strip tenant fields from schemas in HTTP mode
  const s = <T extends Record<string, unknown>>(schema: T) => stripTenantFields(schema, isHttp);

  // ── Orientation ──────────────────────────────────────────────

  server.registerTool("get_company_profile", {
    title: "Get Company Profile",
    description: "Get the full business profile for the authenticated tenant. Call this first in any new conversation.",
    inputSchema: s(getCompanyProfileSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_company_profile", getCompanyProfile));

  server.registerTool("get_financial_summary", {
    title: "Get Financial Summary",
    description: "Dashboard-style financial overview: account balance totals by type, JE/transaction counts, and AR/AP outstanding.",
    inputSchema: s(getFinancialSummarySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_financial_summary", getFinancialSummary));

  // ── Chart of Accounts ─────────────────────────────────────────

  server.registerTool("get_chart_of_accounts", {
    title: "Get Chart of Accounts",
    description: "Get the active Chart of Accounts with account codes, types, hierarchy, and AI mapping hints. Use compact=true to reduce size.",
    inputSchema: s(getChartOfAccountsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_chart_of_accounts", getChartOfAccounts));

  server.registerTool("search_accounts", {
    title: "Search Accounts",
    description: "Fuzzy search for COA accounts by name, code, or keyword. Use this to find account IDs before creating journal entries.",
    inputSchema: s(searchAccountsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("search_accounts", searchAccounts));

  // ── Account Balances & Activity ───────────────────────────────

  server.registerTool("get_account_balances", {
    title: "Get Account Balances",
    description: "Period-based account balance snapshots with opening, debit, credit, closing, and YTD totals.",
    inputSchema: s(getAccountBalancesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_account_balances", getAccountBalances));

  server.registerTool("get_account_activity", {
    title: "Get Account Activity",
    description: "Detailed sub-ledger for a single account: every GL posting with running balance.",
    inputSchema: s(getAccountActivitySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_account_activity", getAccountActivity));

  // ── Financial Accounts (Banks) ────────────────────────────────

  server.registerTool("get_financial_accounts", {
    title: "Get Financial Accounts",
    description: "List bank accounts, credit cards, and other financial accounts with institution info and balances.",
    inputSchema: s(getFinancialAccountsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_financial_accounts", getFinancialAccounts));

  // ── Bank Transactions ─────────────────────────────────────────

  server.registerTool("get_bank_transactions", {
    title: "List Bank Transactions",
    description: "List bank transactions with filtering by status, date, and financial account.",
    inputSchema: s(getBankTransactionsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_bank_transactions", getBankTransactions));

  server.registerTool("search_bank_transactions", {
    title: "Search Bank Transactions",
    description: "Search bank transactions by description, payee, category, or reference number.",
    inputSchema: s(searchBankTransactionsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("search_bank_transactions", searchBankTransactions));

  server.registerTool("create_bank_transactions", {
    title: "Import Bank Transactions",
    description: "Import bank transactions into a financial account. Auto-deduplicates via SHA-256. Requires a financialAccountId from get_financial_accounts.",
    inputSchema: s(createBankTransactionsSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("create_bank_transactions", createBankTransactions));

  server.registerTool("update_bank_transaction_status", {
    title: "Update Bank Transaction Status",
    description: "Bulk-update bank transaction status, categorization, or linked journal entries.",
    inputSchema: s(updateBankTransactionStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_bank_transaction_status", updateBankTransactionStatus));

  server.registerTool("post_bank_transactions", {
    title: "Post Bank Transactions to GL",
    description: "Post categorized bank transactions to the General Ledger, creating double-entry journal entries. Confirm with user before posting.",
    inputSchema: s(postBankTransactionsSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("post_bank_transactions", postBankTransactions));

  // ── Categorization Rules ──────────────────────────────────────

  server.registerTool("get_categorization_rules", {
    title: "Get Categorization Rules",
    description: "List pattern-matching rules that auto-categorize imported bank transactions.",
    inputSchema: s(getCategorizationRulesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_categorization_rules", getCategorizationRules));

  server.registerTool("create_categorization_rule", {
    title: "Create Categorization Rule",
    description: "Create a rule that auto-categorizes future bank transactions matching a pattern.",
    inputSchema: s(createCategorizationRuleSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_categorization_rule", createCategorizationRule));

  server.registerTool("update_categorization_rule", {
    title: "Update Categorization Rule",
    description: "Modify or deactivate an existing categorization rule.",
    inputSchema: s(updateCategorizationRuleSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_categorization_rule", updateCategorizationRule));

  // ── Journal Entries ───────────────────────────────────────────

  server.registerTool("get_journal_entries", {
    title: "List Journal Entries",
    description: "List journal entries with line items, filtered by period, status, or source.",
    inputSchema: s(getJournalEntriesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_journal_entries", getJournalEntries));

  server.registerTool("search_journal_entries", {
    title: "Search Journal Entries",
    description: "Search journal entries by description, memo, entry number, or entity name.",
    inputSchema: s(searchJournalEntriesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("search_journal_entries", searchJournalEntries));

  server.registerTool("create_journal_entries", {
    title: "Create Journal Entries",
    description: "Create double-entry journal entries with balanced debit/credit lines. Requires coaId and account IDs from search_accounts.",
    inputSchema: s(createJournalEntriesSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_journal_entries", createJournalEntries));

  server.registerTool("update_journal_entry_status", {
    title: "Update Journal Entry Status",
    description: "Change journal entry status (draft->posted->approved, any->voided). Voiding is irreversible — confirm with user.",
    inputSchema: s(updateJournalEntryStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_journal_entry_status", updateJournalEntryStatus));

  // ── Journal Entry Templates ───────────────────────────────────

  server.registerTool("get_journal_entry_templates", {
    title: "List Journal Entry Templates",
    description: "List reusable journal entry templates with recurrence settings.",
    inputSchema: s(getJournalEntryTemplatesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_journal_entry_templates", getJournalEntryTemplates));

  server.registerTool("create_journal_entry_template", {
    title: "Create Journal Entry Template",
    description: "Create a reusable template for recurring journal entries (rent, depreciation, payroll).",
    inputSchema: s(createJournalEntryTemplateSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_journal_entry_template", createJournalEntryTemplate));

  server.registerTool("apply_journal_entry_template", {
    title: "Apply Journal Entry Template",
    description: "Execute a template to create a draft journal entry for a specific date.",
    inputSchema: s(applyJournalEntryTemplateSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("apply_journal_entry_template", applyJournalEntryTemplate));

  // ── General Ledger & Trial Balance ────────────────────────────

  server.registerTool("get_general_ledger", {
    title: "Query General Ledger",
    description: "Query the General Ledger: all posted accounting entries with amounts, running balances, and reconciliation status.",
    inputSchema: s(getGeneralLedgerSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_general_ledger", getGeneralLedger));

  server.registerTool("get_trial_balance", {
    title: "Get Trial Balance",
    description: "Trial Balance report: debit and credit totals per account for a given period. Used to verify balance before period close.",
    inputSchema: s(getTrialBalanceSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_trial_balance", getTrialBalance));

  // ── Financial Statements ──────────────────────────────────────

  server.registerTool("get_income_statement", {
    title: "Get Income Statement (P&L)",
    description: "Profit & Loss report: revenue, expenses, and net income for a period.",
    inputSchema: s(getIncomeStatementSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_income_statement", getIncomeStatement));

  server.registerTool("get_balance_sheet", {
    title: "Get Balance Sheet",
    description: "Balance Sheet snapshot: assets, liabilities, and equity as of a given period. Checks A = L + E.",
    inputSchema: s(getBalanceSheetSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_balance_sheet", getBalanceSheet));

  server.registerTool("get_cash_flow_summary", {
    title: "Get Cash Flow Summary",
    description: "Monthly cash flow summary from bank transactions: inflows, outflows, and net cash with top spending categories.",
    inputSchema: s(getCashFlowSummarySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_cash_flow_summary", getCashFlowSummary));

  // ── Customers & AR ────────────────────────────────────────────

  server.registerTool("get_customers", {
    title: "List Customers",
    description: "List customers with outstanding balances, payment terms, and credit limits.",
    inputSchema: s(getCustomersSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_customers", getCustomers));

  server.registerTool("get_customer_statement", {
    title: "Get Customer Statement of Account",
    description: "Full statement of account for a single customer: invoices, payments, credits, and running balance.",
    inputSchema: s(getCustomerStatementSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_customer_statement", getCustomerStatement));

  server.registerTool("get_customer_aging", {
    title: "Get Customer Aging (AR)",
    description: "AR aging report: outstanding invoices grouped by customer in current/30/60/90/90+ day buckets.",
    inputSchema: s(getCustomerAgingSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_customer_aging", getCustomerAging));

  server.registerTool("get_invoice_aging_detail", {
    title: "Get Invoice Aging Detail",
    description: "Invoice-level aging: each outstanding invoice with days past due and aging bucket. More granular than get_customer_aging.",
    inputSchema: s(getInvoiceAgingDetailSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_invoice_aging_detail", getInvoiceAgingDetail));

  // ── Invoices ──────────────────────────────────────────────────

  server.registerTool("get_invoices", {
    title: "List Invoices",
    description: "List invoices with line items, payment amounts, and outstanding balances.",
    inputSchema: s(getInvoicesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_invoices", getInvoices));

  server.registerTool("create_invoice", {
    title: "Create Invoice",
    description: "Create a draft invoice for a customer with line items and auto-generated number. Requires customerId from get_customers.",
    inputSchema: s(createInvoiceSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_invoice", createInvoice));

  server.registerTool("update_invoice_status", {
    title: "Update Invoice Status",
    description: "Change invoice status (draft->finalized->paid/void). Voiding is irreversible — confirm with user.",
    inputSchema: s(updateInvoiceStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_invoice_status", updateInvoiceStatus));

  server.registerTool("get_credit_debit_notes", {
    title: "List Credit/Debit Notes",
    description: "List credit notes (reduce amount owed) and debit notes (increase amount owed) with linked invoices.",
    inputSchema: s(getCreditDebitNotesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_credit_debit_notes", getCreditDebitNotes));

  // ── Vendors & AP ──────────────────────────────────────────────

  server.registerTool("get_vendors", {
    title: "List Vendors",
    description: "List vendors with outstanding bill counts, payment terms, and bank details.",
    inputSchema: s(getVendorsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_vendors", getVendors));

  server.registerTool("get_vendor_statement", {
    title: "Get Vendor Statement",
    description: "Full statement for a single vendor: bills, payments, and outstanding amounts.",
    inputSchema: s(getVendorStatementSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_vendor_statement", getVendorStatement));

  server.registerTool("get_vendor_aging", {
    title: "Get Vendor Aging (AP)",
    description: "AP aging report: outstanding bills grouped by vendor in current/30/60/90/90+ day buckets.",
    inputSchema: s(getVendorAgingSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_vendor_aging", getVendorAging));

  // ── Bills ─────────────────────────────────────────────────────

  server.registerTool("get_bills", {
    title: "List Bills",
    description: "List bills (vendor invoices/payables) with amounts, payment status, and line items.",
    inputSchema: s(getBillsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_bills", getBills));

  // ── Purchase Orders ───────────────────────────────────────────

  server.registerTool("get_purchase_orders", {
    title: "List Purchase Orders",
    description: "List purchase orders with vendor details, line items, and approval status.",
    inputSchema: s(getPurchaseOrdersSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_purchase_orders", getPurchaseOrders));

  // ── Payments ──────────────────────────────────────────────────

  server.registerTool("get_payments", {
    title: "List Payments",
    description: "List all recorded payments, both inbound (from customers) and outbound (to vendors).",
    inputSchema: s(getPaymentsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_payments", getPayments));

  server.registerTool("record_payment", {
    title: "Record Payment",
    description: "Record a payment received from a customer or made to a vendor. Confirm amount and entity with user.",
    inputSchema: s(recordPaymentSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("record_payment", recordPayment));

  // ── Quotations ────────────────────────────────────────────────

  server.registerTool("get_quotations", {
    title: "List Quotations",
    description: "List quotations sent to customers with status and conversion tracking.",
    inputSchema: s(getQuotationsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_quotations", getQuotations));

  // ── Recurring Invoices ────────────────────────────────────────

  server.registerTool("get_recurring_invoices", {
    title: "List Recurring Invoice Templates",
    description: "List recurring invoice templates with frequency, schedule, and next generation date.",
    inputSchema: s(getRecurringInvoicesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_recurring_invoices", getRecurringInvoices));

  // ── Tags ──────────────────────────────────────────────────────

  server.registerTool("get_tags", {
    title: "List Tags",
    description: "List tags used to organize entities, with usage counts.",
    inputSchema: s(getTagsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_tags", getTags));

  // ── Period Management ─────────────────────────────────────────

  server.registerTool("get_period_status", {
    title: "Get Period Status",
    description: "Overview of accounting periods with open/closed status and readiness indicators.",
    inputSchema: s(getPeriodStatusSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_period_status", getPeriodStatus));

  server.registerTool("close_period", {
    title: "Close Accounting Period",
    description: "Lock an accounting period, preventing new journal entries. Check for draft JEs first and confirm with user.",
    inputSchema: s(closePeriodSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("close_period", closePeriod));

  server.registerTool("reopen_period", {
    title: "Reopen Accounting Period",
    description: "Reopen a closed accounting period for corrections. Cannot reopen if a later period is also closed. Confirm with user.",
    inputSchema: s(reopenPeriodSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("reopen_period", reopenPeriod));

  // ── Reconciliation ────────────────────────────────────────────

  server.registerTool("get_reconciliation_status", {
    title: "Get Reconciliation Status",
    description: "Bank reconciliation summary: reconciled vs unreconciled GL entries per account.",
    inputSchema: s(getReconciliationStatusSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_reconciliation_status", getReconciliationStatus));

  server.registerTool("reconcile_accounts", {
    title: "Reconcile GL Entries",
    description: "Mark General Ledger entries as reconciled against bank statement. Confirm entries with user.",
    inputSchema: s(reconcileAccountsSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("reconcile_accounts", reconcileAccounts));

  // ── Customer CRUD ────────────────────────────────────────────

  server.registerTool("create_customer", {
    title: "Create Customer",
    description: `Create a new customer record. Returns the new customer ID.`,
    inputSchema: s(createCustomerSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_customer", createCustomer));

  server.registerTool("update_customer", {
    title: "Update Customer",
    description: `Update an existing customer's details. Returns before/after state.`,
    inputSchema: s(updateCustomerSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_customer", updateCustomer));

  server.registerTool("delete_customer", {
    title: "Deactivate Customer",
    description: `Soft-delete (deactivate) a customer. Fails if customer has outstanding invoices. This is a soft delete — the customer becomes inactive but data is preserved.`,
    inputSchema: s(deleteCustomerSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, t("delete_customer", deleteCustomer));

  // ── Vendor CRUD ─────────────────────────────────────────────

  server.registerTool("create_vendor", {
    title: "Create Vendor",
    description: `Create a new vendor (supplier) record. Returns the new vendor ID.`,
    inputSchema: s(createVendorSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_vendor", createVendor));

  server.registerTool("update_vendor", {
    title: "Update Vendor",
    description: `Update an existing vendor's details. Returns before/after state.`,
    inputSchema: s(updateVendorSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_vendor", updateVendor));

  server.registerTool("delete_vendor", {
    title: "Deactivate Vendor",
    description: `Soft-delete (deactivate) a vendor. Fails if vendor has outstanding bills.`,
    inputSchema: s(deleteVendorSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, t("delete_vendor", deleteVendor));

  // ── Items CRUD ──────────────────────────────────────────────

  server.registerTool("get_items", {
    title: "List Items",
    description: `List product/service items used in invoices, quotations, and bills.`,
    inputSchema: s(getItemsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_items", getItems));

  server.registerTool("create_item", {
    title: "Create Item",
    description: `Create a reusable product/service item with unit price and tax rate.`,
    inputSchema: s(createItemSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_item", createItem));

  server.registerTool("update_item", {
    title: "Update Item",
    description: `Update an existing item's name, price, or tax rate.`,
    inputSchema: s(updateItemSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_item", updateItem));

  server.registerTool("delete_item", {
    title: "Delete Item",
    description: `Permanently delete an item. Does not affect invoices/bills that already reference it.`,
    inputSchema: s(deleteItemSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, t("delete_item", deleteItem));

  // ── Quotation Write Tools ───────────────────────────────────

  server.registerTool("create_quotation", {
    title: "Create Quotation",
    description: `Create a new quotation for a customer with line items and auto-generated number.`,
    inputSchema: s(createQuotationSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_quotation", createQuotation));

  server.registerTool("update_quotation_status", {
    title: "Update Quotation Status",
    description: `Change quotation status. Valid transitions: draft→sent, sent→viewed/accepted/rejected/expired, viewed→accepted/rejected/expired, accepted→converted.`,
    inputSchema: s(updateQuotationStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_quotation_status", updateQuotationStatus));

  // ── Purchase Order Write Tools ──────────────────────────────

  server.registerTool("create_purchase_order", {
    title: "Create Purchase Order",
    description: `Create a new purchase order for a vendor with line items.`,
    inputSchema: s(createPurchaseOrderSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_purchase_order", createPurchaseOrder));

  server.registerTool("update_purchase_order_status", {
    title: "Update Purchase Order Status",
    description: `Change PO status. Valid transitions: draft→pending_approval/approved/void, pending_approval→approved/rejected/void, approved→partially_received/received/closed/void.`,
    inputSchema: s(updatePurchaseOrderStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_purchase_order_status", updatePurchaseOrderStatus));

  // ── Bill Write Tools ────────────────────────────────────────

  server.registerTool("create_bill", {
    title: "Create Bill",
    description: `Create a new bill (vendor invoice) with line items.`,
    inputSchema: s(createBillSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_bill", createBill));

  server.registerTool("update_bill_status", {
    title: "Update Bill Status",
    description: `Change bill status through approval and payment workflow.`,
    inputSchema: s(updateBillStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_bill_status", updateBillStatus));

  // ── Recurring Invoice Write Tools ───────────────────────────

  server.registerTool("create_recurring_invoice", {
    title: "Create Recurring Invoice Template",
    description: `Create an automated recurring invoice template with frequency and schedule.`,
    inputSchema: s(createRecurringInvoiceSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_recurring_invoice", createRecurringInvoice));

  server.registerTool("update_recurring_invoice", {
    title: "Update Recurring Invoice Template",
    description: `Update a recurring invoice template — status, schedule, or settings.`,
    inputSchema: s(updateRecurringInvoiceSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_recurring_invoice", updateRecurringInvoice));

  server.registerTool("delete_recurring_invoice", {
    title: "Cancel Recurring Invoice Template",
    description: `Cancel a recurring invoice template. Soft-delete — sets status to cancelled.`,
    inputSchema: s(deleteRecurringInvoiceSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, t("delete_recurring_invoice", deleteRecurringInvoice));

  // ── Credit/Debit Note Write Tools ───────────────────────────

  server.registerTool("create_credit_debit_note", {
    title: "Create Credit/Debit Note",
    description: `Create a credit note (reduces amount owed) or debit note (increases amount owed) against an invoice.`,
    inputSchema: s(createCreditDebitNoteSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_credit_debit_note", createCreditDebitNote));

  // ── Tag Write Tools ─────────────────────────────────────────

  server.registerTool("create_tag", {
    title: "Create Tag",
    description: `Create a new tag for organizing entities.`,
    inputSchema: s(createTagSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_tag", createTag));

  server.registerTool("update_tag", {
    title: "Update Tag",
    description: `Update a tag's name, color, or description.`,
    inputSchema: s(updateTagSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_tag", updateTag));

  server.registerTool("delete_tag", {
    title: "Delete Tag",
    description: `Delete a tag. All entity assignments for this tag are also removed.`,
    inputSchema: s(deleteTagSchema),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, t("delete_tag", deleteTag));

  server.registerTool("assign_tag", {
    title: "Assign Tag to Entity",
    description: `Assign a tag to an entity (customer, vendor, invoice, bill, quotation, or purchase order).`,
    inputSchema: s(assignTagSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("assign_tag", assignTag));

  // ── COA Account Write Tools ─────────────────────────────────

  server.registerTool("create_account", {
    title: "Create COA Account",
    description: `Create a new account in the Chart of Accounts with code, type, and normal balance direction.`,
    inputSchema: s(createAccountSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_account", createAccount));

  server.registerTool("update_account", {
    title: "Update COA Account",
    description: `Update an account's name, description, or active status. Cannot deactivate system accounts.`,
    inputSchema: s(updateAccountSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("update_account", updateAccount));

  // ── Agreements Module ─────────────────────────────────────────

  server.registerTool("get_agreements", {
    title: "List Agreements", description: `List agreements with status, type, and counterparty filters.`,
    inputSchema: s(getAgreementsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_agreements", getAgreements));

  server.registerTool("get_agreement_detail", {
    title: "Get Agreement Detail", description: `Get a single agreement with signers and version history.`,
    inputSchema: s(getAgreementDetailSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_agreement_detail", getAgreementDetail));

  server.registerTool("create_agreement", {
    title: "Create Agreement", description: `Create a new agreement from scratch or from a template.`,
    inputSchema: s(createAgreementSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_agreement", createAgreement));

  server.registerTool("update_agreement_status", {
    title: "Update Agreement Status", description: `Change agreement status through the workflow (draft→sent→signing→executed→active→completed).`,
    inputSchema: s(updateAgreementStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_agreement_status", updateAgreementStatus));

  server.registerTool("get_clauses", {
    title: "List Clause Library", description: `List reusable contract clauses with category and search filters.`,
    inputSchema: s(getClausesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_clauses", getClauses));

  server.registerTool("get_contract_templates", {
    title: "List Contract Templates", description: `List contract templates for agreement creation.`,
    inputSchema: s(getContractTemplatesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_contract_templates", getContractTemplates));

  server.registerTool("get_billing_schedules", {
    title: "List Billing Schedules", description: `List billing schedules linked to agreements, with milestones.`,
    inputSchema: s(getBillingSchedulesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_billing_schedules", getBillingSchedules));

  server.registerTool("create_billing_schedule", {
    title: "Create Billing Schedule", description: `Create a billing schedule linked to an agreement with milestones.`,
    inputSchema: s(createBillingScheduleSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_billing_schedule", createBillingSchedule));

  // ── Data Room Module ────────────────────────────────────────

  server.registerTool("get_dataroom_folders", {
    title: "List Data Room Folders", description: `List data room folder hierarchy. Metadata only — no file downloads.`,
    inputSchema: s(getDataroomFoldersSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_dataroom_folders", getDataroomFolders));

  server.registerTool("get_dataroom_files", {
    title: "List Data Room Files", description: `List files in data room with folder and search filters. Metadata only.`,
    inputSchema: s(getDataroomFilesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_dataroom_files", getDataroomFiles));

  server.registerTool("get_dataroom_file_detail", {
    title: "Get Data Room File Detail", description: `Get metadata, versions, and access info for a data room file.`,
    inputSchema: s(getDataroomFileDetailSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_dataroom_file_detail", getDataroomFileDetail));

  server.registerTool("search_dataroom", {
    title: "Search Data Room", description: `Search data room files by name, description, or type.`,
    inputSchema: s(searchDataroomSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("search_dataroom", searchDataroom));

  server.registerTool("get_dataroom_activity", {
    title: "Get Data Room Activity", description: `Get data room audit trail — file uploads, downloads, folder changes.`,
    inputSchema: s(getDataroomActivitySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_dataroom_activity", getDataroomActivity));

  server.registerTool("create_dataroom_folder", {
    title: "Create Data Room Folder", description: `Create a new folder in the data room.`,
    inputSchema: s(createDataroomFolderSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_dataroom_folder", createDataroomFolder));

  // ── Fixed Assets Module ─────────────────────────────────────

  server.registerTool("get_fixed_assets", {
    title: "List Fixed Assets", description: `List fixed assets with status, category, and search filters.`,
    inputSchema: s(getFixedAssetsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_fixed_assets", getFixedAssets));

  server.registerTool("get_asset_detail", {
    title: "Get Asset Detail", description: `Get a single asset with depreciation schedule and capital allowance records.`,
    inputSchema: s(getAssetDetailSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_asset_detail", getAssetDetail));

  server.registerTool("create_fixed_asset", {
    title: "Register Fixed Asset", description: `Register a new fixed asset with depreciation parameters.`,
    inputSchema: s(createFixedAssetSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("create_fixed_asset", createFixedAsset));

  server.registerTool("update_asset_status", {
    title: "Update Asset Status", description: `Change asset status: draft→active, active→disposed/held_for_sale/fully_depreciated.`,
    inputSchema: s(updateAssetStatusSchema),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, t("update_asset_status", updateAssetStatus));

  server.registerTool("get_asset_categories", {
    title: "List Asset Categories", description: `List asset categories with depreciation defaults and capital allowance rates.`,
    inputSchema: s(getAssetCategoriesSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_asset_categories", getAssetCategories));

  server.registerTool("get_depreciation_schedule", {
    title: "Get Depreciation Schedule", description: `Get depreciation schedule for a specific asset or period.`,
    inputSchema: s(getDepreciationScheduleSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_depreciation_schedule", getDepreciationSchedule));

  server.registerTool("get_asset_summary", {
    title: "Get Asset Register Summary", description: `Summary of fixed asset register by category and status.`,
    inputSchema: s(getAssetSummarySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_asset_summary", getAssetSummary));

  // ── Staff/Team Module (read-only) ───────────────────────────

  server.registerTool("get_team_members", {
    title: "List Team Members", description: `List users with roles and status for this organization.`,
    inputSchema: s(getTeamMembersSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_team_members", getTeamMembers));

  server.registerTool("get_staff_invitations", {
    title: "List Staff Invitations", description: `List pending, accepted, and expired staff invitations.`,
    inputSchema: s(getStaffInvitationsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_staff_invitations", getStaffInvitations));

  server.registerTool("get_organization_link_requests", {
    title: "List Organization Link Requests", description: `List pending organization link requests.`,
    inputSchema: s(getOrganizationLinkRequestsSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_organization_link_requests", getOrganizationLinkRequests));

  // ── Audit Trail Module ──────────────────────────────────────

  server.registerTool("get_audit_trail", {
    title: "Get Audit Trail", description: `Cross-module audit log with entity type, user, and date range filters.`,
    inputSchema: s(getAuditTrailSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_audit_trail", getAuditTrail));

  server.registerTool("get_entity_history", {
    title: "Get Entity History", description: `Get change history for a specific entity (invoice, bill, customer, etc.).`,
    inputSchema: s(getEntityHistorySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_entity_history", getEntityHistory));

  // ── E-Invoice Module ────────────────────────────────────────

  server.registerTool("get_einvoice_status", {
    title: "Get E-Invoice Status", description: `Check e-invoice credential status (masked) and submission statistics.`,
    inputSchema: s(getEinvoiceStatusSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("get_einvoice_status", getEinvoiceStatus));

  // ── Scope-enforcing wrapper for tools without tenant params ───
  const withCodeScope = <A>(
    toolName: string,
    handler: (args: A) => Promise<CallToolResult>,
  ) => {
    return async (args: A) => {
      if (authRecord) {
        const scope = getToolScope(toolName);
        if (!checkScope(authRecord, scope)) {
          log.warn("Scope denied", { tool: toolName, required: scope, scopes: authRecord.scopes });
          return errorResponse(
            `Insufficient permissions: this API key requires "${scope}" scope to use ${toolName}.`,
          );
        }
      }
      const startTime = Date.now();
      try {
        const result = await handler(args);
        recordToolExecution(toolName, !result.isError, Date.now() - startTime);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordToolExecution(toolName, false, Date.now() - startTime);
        return errorResponse(msg);
      }
    };
  };

  // ── Code Mode (Advanced) ──────────────────────────────────────

  server.registerTool("search_schema", {
    title: "Search Database Schema",
    description: "Discover database tables, columns, types, and foreign keys. Always call this before execute_query.",
    inputSchema: s(searchSchemaSchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, withCodeScope("search_schema", searchSchema));

  server.registerTool("execute_query", {
    title: "Execute SQL Query",
    description: "Run a read-only SQL SELECT query with auto-injected tenant filter. Must use search_schema first. Show query to user before executing.",
    inputSchema: s(executeQuerySchema),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, t("execute_query", executeQuery));

  // ── Code Mode (Programmable) ──────────────────────────────────
  // These tools use _origRegisterTool (bypassing the registry interceptor) and
  // withCodeScope (not t()) because they don't have clientId/accountingFirmId params.
  // The underlying cynco.* calls go through t()-wrapped handlers with full tenant/scope checks.

  const codeModeSearchHandler = createSearchToolsHandler(toolRegistryEntries);
  const codeModeExecuteHandler = createExecuteCodeHandler(toolHandlers);

  _origRegisterTool("search_tools", {
    title: "Search Tools",
    description: "Discover available tools and get TypeScript signatures for use with execute_code.",
    inputSchema: searchToolsSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, withCodeScope("search_tools", codeModeSearchHandler));

  _origRegisterTool("execute_code", {
    title: "Execute Code",
    description: "Run a JavaScript script calling multiple tools in one round-trip via cynco.*. Sandboxed with 60s timeout. Use search_tools first.",
    inputSchema: executeCodeSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, withCodeScope("execute_code", codeModeExecuteHandler));

  // ── Prompts ─────────────────────────────────────────────────────

  registerPrompts(server);

  // ── Resources ───────────────────────────────────────────────────

  registerResources(server);

  // ── MCP Apps (interactive UIs) ─────────────────────────────────

  registerApps(server);

  return server;
}
