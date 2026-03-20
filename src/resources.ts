import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  // ── Static guides ─────────────────────────────────────────────
  server.registerResource("getting-started", "cynco://guide/getting-started", {
    title: "Getting Started Guide",
    description: "How to use the Cynco MCP server effectively — 105 tools across 15 modules.",
    mimeType: "text/markdown",
  }, async () => ({
    contents: [{
      uri: "cynco://guide/getting-started",
      mimeType: "text/markdown",
      text: GETTING_STARTED,
    }],
  }));

  server.registerResource("workflows", "cynco://guide/workflows", {
    title: "Accounting Workflows",
    description: "Common accounting workflows and how to execute them with MCP tools.",
    mimeType: "text/markdown",
  }, async () => ({
    contents: [{
      uri: "cynco://guide/workflows",
      mimeType: "text/markdown",
      text: WORKFLOWS,
    }],
  }));

  server.registerResource("conventions", "cynco://guide/conventions", {
    title: "Accounting Conventions",
    description: "Accounting standards, terminology, and conventions used by Cynco.",
    mimeType: "text/markdown",
  }, async () => ({
    contents: [{
      uri: "cynco://guide/conventions",
      mimeType: "text/markdown",
      text: CONVENTIONS,
    }],
  }));

  server.registerResource("scopes", "cynco://guide/scopes", {
    title: "API Scopes Reference",
    description: "Module-level scopes for granular API key permissions.",
    mimeType: "text/markdown",
  }, async () => ({
    contents: [{
      uri: "cynco://guide/scopes",
      mimeType: "text/markdown",
      text: SCOPES,
    }],
  }));
}

const GETTING_STARTED = `# Cynco MCP Server — Getting Started

## First Steps
1. Call \`get_company_profile\` to understand the business you're working with
2. Call \`get_financial_summary\` for a high-level overview of the financial position
3. Call \`get_chart_of_accounts\` with \`compact=true\` to see the account structure

## Key Concepts
- **Tenant isolation**: Every query is scoped to a single tenant (client or accounting firm). In HTTP mode, your API key determines the tenant. In stdio mode, pass \`clientId\` or \`accountingFirmId\`.
- **Double-entry accounting**: Every transaction has balanced debits and credits.
- **Periods**: Accounting periods are formatted as \`YYYY-MM\`. Use \`get_period_status\` to check which periods are open/closed.

## Tool Modules (105 tools)
| Module | Read Tools | Write Tools | Scope |
|--------|-----------|-------------|-------|
| **Accounting** | get_chart_of_accounts, search_accounts, get_account_balances, get_account_activity, get_financial_accounts, get_bank_transactions, search_bank_transactions, get_categorization_rules, get_journal_entries, search_journal_entries, get_journal_entry_templates, get_general_ledger, get_period_status, get_reconciliation_status, get_payments | create_bank_transactions, update_bank_transaction_status, post_bank_transactions, create/update_categorization_rule, create_journal_entries, update_journal_entry_status, create/apply_journal_entry_template, create/update_account, close/reopen_period, reconcile_accounts, record_payment | accounting:* |
| **Reports** | get_financial_summary, get_trial_balance, get_income_statement, get_balance_sheet, get_cash_flow_summary | — | reports:read |
| **Customers** | get_customers, get_customer_statement, get_customer_aging, get_invoice_aging_detail | create/update/delete_customer | customers:* |
| **Invoicing** | get_invoices, get_credit_debit_notes, get_quotations, get_recurring_invoices, get_items | create_invoice, update_invoice_status, create_credit_debit_note, create/update_quotation_status, create/update/delete_recurring_invoice, create/update/delete_item | invoicing:* |
| **Vendors** | get_vendors, get_vendor_statement, get_vendor_aging, get_bills, get_purchase_orders | create/update/delete_vendor, create_bill, update_bill_status, create_purchase_order, update_purchase_order_status | vendors:* |
| **Tags** | get_tags | create/update/delete_tag, assign_tag | tags:* |
| **Agreements** | get_agreements, get_agreement_detail, get_clauses, get_contract_templates, get_billing_schedules | create_agreement, update_agreement_status, create_billing_schedule | agreements:* |
| **Data Room** | get_dataroom_folders, get_dataroom_files, get_dataroom_file_detail, search_dataroom, get_dataroom_activity | create_dataroom_folder | dataroom:* |
| **Fixed Assets** | get_fixed_assets, get_asset_detail, get_asset_categories, get_depreciation_schedule, get_asset_summary | create_fixed_asset, update_asset_status | assets:* |
| **Admin** | get_team_members, get_staff_invitations, get_organization_link_requests, get_audit_trail, get_entity_history, get_einvoice_status | — | admin:read |
| **SQL Mode** | search_schema, execute_query | — | query:execute |
| **Code Mode** | search_tools | execute_code | code:execute |

## Code Mode (Programmable Tools)
For multi-step workflows, use Code Mode to call multiple tools in a single round-trip:
1. Call \`search_tools({query: "invoices"})\` to discover tools and get TypeScript signatures
2. Call \`execute_code({code: "..."})\` with a script that uses \`await cynco.<tool_name>(args)\`

This reduces token usage by ~90% for complex workflows — one script replaces many tool calls.
Requires \`code:execute\` scope on the API key.

## Tips
- Use \`compact=true\` on list tools to reduce token usage
- Use \`search_accounts\` to find the right COA account before creating journal entries
- Use prompts for guided multi-step workflows
- Use Code Mode (\`search_tools\` + \`execute_code\`) for multi-step workflows to save tokens
- All write tools validate inputs and enforce status transition rules
- Delete operations are soft-deletes (deactivate) — data is never destroyed
`;

const WORKFLOWS = `# Common Workflows

## 1. Import and Categorize Bank Transactions
\`\`\`
get_financial_accounts              → Find the bank account ID
create_bank_transactions            → Import (auto-deduplicates)
get_bank_transactions(status=imported) → Review imported
search_accounts                     → Find matching COA accounts
update_bank_transaction_status      → Set category
post_bank_transactions              → Create journal entries
\`\`\`

## 2. Month-End Close
\`\`\`
get_period_status                   → Check period is open
get_journal_entries(status=draft)   → Review drafts
get_reconciliation_status           → Ensure reconciled
get_trial_balance                   → Verify debits = credits
get_income_statement + get_balance_sheet → Review financials
close_period                        → Lock the period
\`\`\`

## 3. Customer Invoice Lifecycle
\`\`\`
get_customers                       → Find/create customer
create_invoice                      → Create draft invoice
update_invoice_status(finalized)    → Finalize
record_payment                      → Record when paid
update_invoice_status(paid)         → Mark as paid
\`\`\`

## 4. Vendor Bill Lifecycle
\`\`\`
get_vendors                         → Find/create vendor
create_bill                         → Create draft bill
update_bill_status(approved)        → Approve
record_payment                      → Record payment
update_bill_status(paid)            → Mark as paid
\`\`\`

## 5. Quotation to Invoice
\`\`\`
get_customers                       → Find customer
create_quotation                    → Create draft quotation
update_quotation_status(sent)       → Send to customer
update_quotation_status(accepted)   → Customer accepts
create_invoice                      → Convert to invoice
\`\`\`

## 6. Agreement Workflow
\`\`\`
get_contract_templates              → Browse templates
create_agreement                    → Create from template
update_agreement_status(sent)       → Send for review
update_agreement_status(signing)    → Move to signing
update_agreement_status(executed)   → Both parties signed
create_billing_schedule             → Set up billing
\`\`\`

## 7. Fixed Asset Register
\`\`\`
get_asset_categories                → Review categories
create_fixed_asset                  → Register asset
update_asset_status(active)         → Activate
get_depreciation_schedule           → Review depreciation
get_asset_summary                   → Register summary
\`\`\`

## 8. Financial Health Check
\`\`\`
get_company_profile                 → Business context
get_financial_summary               → Overview
get_balance_sheet                   → Assets/liabilities
get_income_statement                → Revenue/expenses
get_cash_flow_summary               → Cash position
get_customer_aging + get_vendor_aging → Working capital
\`\`\`
`;

const CONVENTIONS = `# Accounting Conventions

## Double-Entry Bookkeeping
Every transaction must have equal debits and credits. The accounting equation:
**Assets = Liabilities + Equity**

## Account Types and Normal Balances
| Account Type | Normal Balance | Debit Effect | Credit Effect |
|-------------|---------------|--------------|---------------|
| Asset | Debit | Increase | Decrease |
| Liability | Credit | Decrease | Increase |
| Equity | Credit | Decrease | Increase |
| Revenue | Credit | Decrease | Increase |
| Expense | Debit | Increase | Decrease |

## Period Format
All periods use \`YYYY-MM\` format (e.g., \`2026-01\` for January 2026).

## Status Lifecycles

**Journal Entry:** draft → posted → approved (any → voided)
**Bank Transaction:** imported → categorized → posted → reconciled
**Invoice:** draft → finalized → paid/partially_paid/overdue (any → void)
**Bill:** draft → in_review → pending_approval → approved → awaiting_payment → paid
**Quotation:** draft → sent → viewed → accepted → converted
**Purchase Order:** draft → pending_approval → approved → received → closed
**Agreement:** draft → sent → negotiating → signing → executed → active → completed
**Fixed Asset:** draft → active → disposed/fully_depreciated

## Currency
All amounts are stored in the tenant's base currency (typically MYR). Amounts use 2 decimal places.

## TypeID Prefixes
| Prefix | Entity |
|--------|--------|
| client_ | Client (business entity) |
| accfirm_ | Accounting firm |
| usr_ | User account |
| coa_ | Chart of Accounts |
| acc_ | Account |
| jnl_ | Journal Entry |
| btx_ | Bank Transaction |
| fac_ | Financial Account |
| inv_ | Invoice |
| cust_ | Customer |
| vend_ | Vendor |
| quot_ | Quotation |
| po_ | Purchase Order |
| bil_ | Bill |
| tag_ | Tag |
| agr_ | Agreement |
| dfld_ | Data Room Folder |
| dfil_ | Data Room File |
| ast_ | Fixed Asset |
| asc_ | Asset Category |
| cdn_ | Credit/Debit Note |
| ritpl_ | Recurring Invoice Template |
| bsch_ | Billing Schedule |
`;

const SCOPES = `# API Scopes Reference

## Legacy Scopes (backwards compatible)
| Scope | Access |
|-------|--------|
| \`read\` | All read operations across all modules |
| \`write\` | All write operations (implies read) |
| \`query:execute\` | SQL query execution (search_schema + execute_query) |
| \`code:execute\` | Code Mode (search_tools + execute_code) |

## Module Scopes
| Scope | Access |
|-------|--------|
| \`accounting:read\` | COA, bank transactions, journal entries, GL, periods, reconciliation |
| \`accounting:write\` | Create/update above (implies accounting:read) |
| \`invoicing:read\` | Invoices, quotations, recurring invoices, items, credit/debit notes |
| \`invoicing:write\` | Create/update above (implies invoicing:read) |
| \`customers:read\` | Customer list, statements, aging |
| \`customers:write\` | Create/update/delete customers (implies customers:read) |
| \`vendors:read\` | Vendors, bills, purchase orders, vendor aging |
| \`vendors:write\` | Create/update/delete vendors/bills/POs (implies vendors:read) |
| \`reports:read\` | Financial summary, trial balance, income statement, balance sheet, cash flow |
| \`tags:read\` | Tag list |
| \`tags:write\` | Create/update/delete/assign tags (implies tags:read) |
| \`agreements:read\` | Agreements, clauses, templates, billing schedules |
| \`agreements:write\` | Create/update agreements and billing schedules (implies agreements:read) |
| \`dataroom:read\` | Folders, files, search, activity log |
| \`dataroom:write\` | Create folders (implies dataroom:read) |
| \`assets:read\` | Fixed assets, categories, depreciation, summaries |
| \`assets:write\` | Create/update assets (implies assets:read) |
| \`admin:read\` | Team members, invitations, audit trail, e-invoice status |
| \`admin:write\` | Reserved for future use (implies admin:read) |

## Scope Rules
- Empty scopes = full access (backwards compat for existing keys)
- Module write always implies module read
- Legacy \`read\` grants any \`*:read\` scope
- Legacy \`write\` grants any \`*:write\` scope
`;
