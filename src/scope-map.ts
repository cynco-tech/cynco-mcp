/**
 * Maps every MCP tool to its required scope.
 * Used by withTenant for enforcement and by the Remix UI for display.
 */
import type { ToolScope } from "./auth.js";

export const TOOL_SCOPE_MAP: Record<string, ToolScope> = {
  // ── Orientation ──
  get_company_profile: "accounting:read",
  get_financial_summary: "reports:read",

  // ── Chart of Accounts ──
  get_chart_of_accounts: "accounting:read",
  search_accounts: "accounting:read",
  create_account: "accounting:write",
  update_account: "accounting:write",

  // ── Account Balances & Activity ──
  get_account_balances: "accounting:read",
  get_account_activity: "accounting:read",

  // ── Financial Accounts (Banks) ──
  get_financial_accounts: "accounting:read",

  // ── Bank Transactions ──
  get_bank_transactions: "accounting:read",
  search_bank_transactions: "accounting:read",
  create_bank_transactions: "accounting:write",
  update_bank_transaction_status: "accounting:write",
  post_bank_transactions: "accounting:write",

  // ── Categorization Rules ──
  get_categorization_rules: "accounting:read",
  create_categorization_rule: "accounting:write",
  update_categorization_rule: "accounting:write",

  // ── Journal Entries ──
  get_journal_entries: "accounting:read",
  search_journal_entries: "accounting:read",
  create_journal_entries: "accounting:write",
  update_journal_entry_status: "accounting:write",

  // ── Journal Entry Templates ──
  get_journal_entry_templates: "accounting:read",
  create_journal_entry_template: "accounting:write",
  apply_journal_entry_template: "accounting:write",

  // ── General Ledger & Trial Balance ──
  get_general_ledger: "accounting:read",
  get_trial_balance: "reports:read",

  // ── Financial Statements ──
  get_income_statement: "reports:read",
  get_balance_sheet: "reports:read",
  get_cash_flow_summary: "reports:read",

  // ── Customers & AR ──
  get_customers: "customers:read",
  get_customer_statement: "customers:read",
  get_customer_aging: "customers:read",
  get_invoice_aging_detail: "customers:read",
  create_customer: "customers:write",
  update_customer: "customers:write",
  delete_customer: "customers:write",

  // ── Invoices ──
  get_invoices: "invoicing:read",
  create_invoice: "invoicing:write",
  update_invoice_status: "invoicing:write",
  get_credit_debit_notes: "invoicing:read",
  create_credit_debit_note: "invoicing:write",

  // ── Vendors & AP ──
  get_vendors: "vendors:read",
  get_vendor_statement: "vendors:read",
  get_vendor_aging: "vendors:read",
  create_vendor: "vendors:write",
  update_vendor: "vendors:write",
  delete_vendor: "vendors:write",

  // ── Bills ──
  get_bills: "vendors:read",
  create_bill: "vendors:write",
  update_bill_status: "vendors:write",

  // ── Purchase Orders ──
  get_purchase_orders: "vendors:read",
  create_purchase_order: "vendors:write",
  update_purchase_order_status: "vendors:write",

  // ── Payments ──
  get_payments: "accounting:read",
  record_payment: "accounting:write",

  // ── Quotations ──
  get_quotations: "invoicing:read",
  create_quotation: "invoicing:write",
  update_quotation_status: "invoicing:write",

  // ── Recurring Invoices ──
  get_recurring_invoices: "invoicing:read",
  create_recurring_invoice: "invoicing:write",
  update_recurring_invoice: "invoicing:write",
  delete_recurring_invoice: "invoicing:write",

  // ── Tags ──
  get_tags: "tags:read",
  create_tag: "tags:write",
  update_tag: "tags:write",
  delete_tag: "tags:write",
  assign_tag: "tags:write",

  // ── Items ──
  get_items: "invoicing:read",
  create_item: "invoicing:write",
  update_item: "invoicing:write",
  delete_item: "invoicing:write",

  // ── Period Management ──
  get_period_status: "accounting:read",
  close_period: "accounting:write",
  reopen_period: "accounting:write",

  // ── Reconciliation ──
  get_reconciliation_status: "accounting:read",
  reconcile_accounts: "accounting:write",

  // ── Agreements (Phase 4) ──
  get_agreements: "agreements:read",
  get_agreement_detail: "agreements:read",
  create_agreement: "agreements:write",
  update_agreement_status: "agreements:write",
  get_clauses: "agreements:read",
  get_contract_templates: "agreements:read",
  get_billing_schedules: "agreements:read",
  create_billing_schedule: "agreements:write",

  // ── Data Room (Phase 4) ──
  get_dataroom_folders: "dataroom:read",
  get_dataroom_files: "dataroom:read",
  get_dataroom_file_detail: "dataroom:read",
  search_dataroom: "dataroom:read",
  get_dataroom_activity: "dataroom:read",
  create_dataroom_folder: "dataroom:write",

  // ── Fixed Assets (Phase 4) ──
  get_fixed_assets: "assets:read",
  get_asset_detail: "assets:read",
  create_fixed_asset: "assets:write",
  update_asset_status: "assets:write",
  get_asset_categories: "assets:read",
  get_depreciation_schedule: "assets:read",
  get_asset_summary: "assets:read",

  // ── Staff/Team (Phase 4, read-only) ──
  get_team_members: "admin:read",
  get_staff_invitations: "admin:read",
  get_organization_link_requests: "admin:read",

  // ── Audit Trail (Phase 4) ──
  get_audit_trail: "admin:read",
  get_entity_history: "admin:read",

  // ── E-Invoice (Phase 4) ──
  get_einvoice_status: "admin:read",

  // ── SQL Mode ──
  search_schema: "query:execute",
  execute_query: "query:execute",

  // ── Code Mode ──
  search_tools: "code:execute",
  execute_code: "code:execute",
};

/**
 * Get the required scope for a tool, falling back to "read" if not mapped.
 */
export function getToolScope(toolName: string): ToolScope {
  return TOOL_SCOPE_MAP[toolName] ?? "read";
}
