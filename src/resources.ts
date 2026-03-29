import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  // ── Static guides ─────────────────────────────────────────────
  server.registerResource("getting-started", "cynco://guide/getting-started", {
    title: "Getting Started Guide",
    description: "How to use the Cynco MCP server effectively — 107 tools across 12 modules.",
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

  server.registerResource("tool-selection", "cynco://guide/tool-selection", {
    title: "Tool Selection Guide",
    description: "Which tool to use when — disambiguation hints, workflow sequences, and safety warnings organized by module.",
    mimeType: "text/markdown",
  }, async () => ({
    contents: [{
      uri: "cynco://guide/tool-selection",
      mimeType: "text/markdown",
      text: TOOL_SELECTION,
    }],
  }));

  server.registerResource("presentation", "cynco://guide/presentation", {
    title: "Data Presentation Guide",
    description: "How to render Cynco financial data beautifully for users — formatting, layout, and visualization rules.",
    mimeType: "text/markdown",
  }, async () => ({
    contents: [{
      uri: "cynco://guide/presentation",
      mimeType: "text/markdown",
      text: PRESENTATION,
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

## Tool Modules (107 tools across 12 modules)
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
- Read \`cynco://guide/tool-selection\` for disambiguation hints, workflow sequences, and safety warnings — it helps you pick the right tool when multiple tools seem similar
- Read \`cynco://guide/presentation\` for formatting rules — it teaches you how to render financial data beautifully for users
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

const PRESENTATION = `# Data Presentation Guide

When presenting Cynco financial data to users, follow these rules to ensure a polished, professional experience.

## Core Principles
1. **Never dump raw JSON** — always format data into clean tables, summaries, or structured reports
2. **Lead with the headline** — start with the key number or insight, then show supporting detail
3. **Use the right format for the data type** — don't force everything into tables

## Number Formatting
- **Currency**: Always include the currency symbol and 2 decimal places. Use locale-appropriate separators: \`RM 12,450.00\` not \`12450\`
- **Percentages**: One decimal place with % sign: \`23.5%\` not \`0.235\`
- **Counts**: Use commas for thousands: \`1,247\` not \`1247\`
- **Negative amounts**: Use parentheses for accounting: \`(RM 500.00)\` not \`-RM 500.00\`
- **Zero amounts**: Show as \`RM 0.00\` or \`—\` depending on context (use dash for "not applicable")

## Color Coding (when the client supports it)
- **Positive/favorable**: Green — revenue growth, assets, cash inflow, on-time payments
- **Negative/unfavorable**: Red — losses, overdue amounts, cash outflow, declined items
- **Neutral/informational**: Default text color — labels, descriptions, dates
- **Warning**: Amber — approaching limits, expiring soon, pending review

## Tool-Specific Presentation

### Financial Summary (\`get_financial_summary\`)
Present as a **dashboard with KPI tiles**:
- Row 1: Total Revenue | Total Expenses | Net Income
- Row 2: Cash Balance | AR Outstanding | AP Outstanding
- Row 3: Draft JEs | Uncategorized Transactions | Open Period

### Trial Balance (\`get_trial_balance\`)
Present as a **two-column table** with account hierarchy:
- Left: Account Code + Account Name (indented by hierarchy level)
- Right: Debit | Credit columns, right-aligned
- Footer: Total Debits | Total Credits (must balance)
- Highlight if totals don't balance

### Income Statement (\`get_income_statement\`)
Present as a **structured financial report**, not a flat table:
\`\`\`
Revenue
  Sales Revenue                    RM 125,000.00
  Service Revenue                   RM 45,000.00
  ─────────────────────────────────────────────
  Total Revenue                    RM 170,000.00

Expenses
  Cost of Goods Sold               (RM 62,000.00)
  Operating Expenses               (RM 43,000.00)
  ─────────────────────────────────────────────
  Total Expenses                   (RM 105,000.00)

  ═════════════════════════════════════════════
  Net Income                        RM 65,000.00
\`\`\`

### Balance Sheet (\`get_balance_sheet\`)
Present as a **structured report with sections**:
- Assets (Current → Non-Current → Total)
- Liabilities (Current → Non-Current → Total)
- Equity
- Footer: A = L + E verification

### Customer/Vendor Aging (\`get_customer_aging\`, \`get_vendor_aging\`)
Present as a **table with aging buckets**:
| Customer | Current | 1-30 | 31-60 | 61-90 | 90+ | Total |
Right-align all amounts. Bold the Total column. Highlight 90+ in red.
Include a summary row at the bottom with totals per bucket.

### Invoice/Bill Lists (\`get_invoices\`, \`get_bills\`)
Present as a **sortable table** with key columns:
| # | Customer/Vendor | Date | Due Date | Amount | Paid | Outstanding | Status |
Color-code status: draft=gray, finalized=blue, overdue=red, paid=green.

### Cash Flow (\`get_cash_flow_summary\`)
Present as a **monthly trend**:
| Month | Inflows | Outflows | Net | Running Balance |
If the client supports charts, suggest a line chart with inflows (green) and outflows (red).

### Journal Entries (\`get_journal_entries\`)
Present as a **ledger table**:
| # | Date | Description | Debit | Credit | Status |
Group lines by entry. Show balanced totals per entry.

### Statements (\`get_customer_statement\`, \`get_vendor_statement\`)
Present as a **running statement**:
| Date | Description | Debit | Credit | Balance |
Start with opening balance, end with closing balance.

### Chart of Accounts (\`get_chart_of_accounts\`)
Present as an **indented hierarchy** by parent_id:
\`\`\`
1000  Assets
  1100  Current Assets
    1110  Cash and Cash Equivalents
    1120  Accounts Receivable
  1200  Non-Current Assets
    1210  Property, Plant & Equipment
\`\`\`

### General Ledger (\`get_general_ledger\`)
Present as a **running ledger** with running balance:
| Date | JE # | Description | Debit | Credit | Balance |

## Empty States
When a query returns no data, provide a helpful message:
- "No invoices found for this period" — not "No data"
- "No overdue receivables — all customers are current" — positive framing when appropriate
- Suggest a next action when relevant: "No journal entries for March. Would you like to create one?"

## Comparative Presentation
When the user asks for trends or comparisons:
- Always show the comparison period alongside the current period
- Calculate and show the change (absolute and percentage)
- Use ↑/↓ arrows or color to indicate direction
- Example: \`Revenue: RM 170,000 ↑ 12.3% vs prior month\`

## Summary Best Practices
- Always state the **period** and **currency** at the top of any financial report
- Round summary totals to nearest whole number if presenting KPI tiles
- Include the **as-of date** for balance-based reports (balance sheet, aging)
- When showing multiple reports, maintain consistent column widths and alignment
`;

const TOOL_SELECTION = `# Tool Selection Guide

Read this guide to choose the right tool for each task. Tools are grouped by module.

## Getting Started
Always call \`get_company_profile\` first to understand the tenant. Follow with \`get_financial_summary\` for a financial overview before drilling into specific areas.

## Accounting — Chart of Accounts

**Disambiguation:**
- \`get_chart_of_accounts\` — full COA tree (use compact=true to reduce size). Use when you need the hierarchy or multiple account IDs.
- \`search_accounts\` — fuzzy search by name/code/keyword. Faster for finding a single account. Always prefer this before creating journal entries or categorization rules.
- \`get_account_balances\` — period-based balance snapshots (opening, debit, credit, closing, YTD). NOT individual transactions.
- \`get_account_activity\` — sub-ledger detail for ONE account: every GL posting with running balance. For drilling into a specific account.
- \`get_general_ledger\` — full GL across ALL accounts. For cross-account audit or period review. For a single account, prefer \`get_account_activity\`.
- \`create_account\` / \`update_account\` — manage COA accounts directly.

## Accounting — Bank Transactions

**Workflow: Import -> Categorize -> Post**
1. \`get_financial_accounts\` — find the target bank/credit card account ID
2. \`create_bank_transactions\` — import transactions (auto-deduplicates via SHA-256)
3. \`get_bank_transactions\` — review imported transactions (filter by status)
4. \`search_bank_transactions\` — find specific transactions by keyword
5. \`update_bank_transaction_status\` — categorize (set suggestedCoaAccountId + status="categorized")
6. \`post_bank_transactions\` — create double-entry journal entries from categorized transactions. **Confirm with user before posting.**

**Disambiguation:**
- \`get_bank_transactions\` — list/filter. \`search_bank_transactions\` — keyword search.
- \`get_financial_accounts\` — bank/credit card accounts (institutions). \`get_chart_of_accounts\` — COA ledger accounts.

## Accounting — Categorization Rules

- \`get_categorization_rules\` — list auto-categorization rules
- \`create_categorization_rule\` — create a pattern-matching rule for recurring transactions. Find the COA account first via \`search_accounts\`.
- \`update_categorization_rule\` — modify or deactivate (isActive=false) an existing rule.

## Accounting — Journal Entries

**Workflow: Create -> Post -> Approve**
1. \`search_accounts\` — find account IDs for debit/credit lines
2. \`create_journal_entries\` — create draft entries (debits must equal credits)
3. \`update_journal_entry_status\` — transition: draft->posted->approved. **Voiding is irreversible — always confirm with user.**

**Disambiguation:**
- \`get_journal_entries\` — list/filter entries. \`search_journal_entries\` — keyword search entries.
- \`create_journal_entries\` — manual entries. \`post_bank_transactions\` — auto-creates entries from categorized bank transactions.

## Accounting — Journal Entry Templates

- \`get_journal_entry_templates\` — list reusable templates (rent, depreciation, payroll)
- \`create_journal_entry_template\` — create template for recurring entries
- \`apply_journal_entry_template\` — execute a template to create a draft entry for a specific date. Post it afterward with \`update_journal_entry_status\`.

## Accounting — Period Management

**Workflow: Month-End Close**
1. \`get_period_status\` — check which periods are open/ready
2. \`get_journal_entries\` (status=draft) — ensure no drafts remain
3. \`get_reconciliation_status\` — verify reconciliation progress
4. \`get_trial_balance\` — verify debits = credits
5. \`close_period\` — lock the period. **Warn user if draft JEs exist. Always confirm.**
6. \`reopen_period\` — unlock a closed period for corrections. Cannot reopen if a later period is closed.

## Accounting — Reconciliation

- \`get_reconciliation_status\` — summary of reconciled vs unreconciled GL entries per account
- \`reconcile_accounts\` — mark GL entries as reconciled. Find unreconciled entries first via \`get_general_ledger\` (isReconciled=false). **Confirm entries with user.**

## Reports

**Disambiguation:**
- \`get_financial_summary\` — dashboard KPIs (totals by type, JE counts, AR/AP outstanding). Start here for an overview.
- \`get_trial_balance\` — debit/credit verification report. For period-end checks.
- \`get_income_statement\` — P&L: revenue minus expenses = net income. For profitability analysis.
- \`get_balance_sheet\` — assets, liabilities, equity snapshot. For financial position.
- \`get_cash_flow_summary\` — monthly inflows/outflows from bank transactions. For cash trend analysis.

These are read-only. None of these modify data.

## Customers & Accounts Receivable

**Disambiguation:**
- \`get_customers\` — list customers with balances and payment terms. Use to find a customerId.
- \`get_customer_statement\` — full statement for ONE customer: invoices, payments, credits, running balance.
- \`get_customer_aging\` — AR aging by CUSTOMER: totals in current/30/60/90/90+ buckets.
- \`get_invoice_aging_detail\` — AR aging by INVOICE: each outstanding invoice with days past due. More granular than customer aging.

**CRUD:** \`create_customer\`, \`update_customer\`, \`delete_customer\` (soft-delete, fails if outstanding invoices).

## Invoicing

**Workflow: Quote -> Invoice -> Payment**
1. \`get_customers\` — find or create customer
2. \`create_quotation\` -> \`update_quotation_status\` (draft->sent->accepted->converted)
3. \`create_invoice\` — creates draft. Needs customerId and line items. **Confirm with user.**
4. \`update_invoice_status\` — finalize, mark paid, or void. **Voiding is irreversible.**
5. \`record_payment\` — record payment received
6. \`update_invoice_status\` (->paid) — mark as paid after full payment

**Disambiguation:**
- \`get_invoices\` — list/filter invoices. \`get_credit_debit_notes\` — adjustments to invoiced amounts.
- \`get_quotations\` — proposals/quotes. \`get_recurring_invoices\` — automated invoice templates.
- \`create_credit_debit_note\` — credit note reduces amount owed, debit note increases it.

**Items:** \`get_items\`, \`create_item\`, \`update_item\`, \`delete_item\` — reusable line items for invoices/quotations/bills.

**Recurring:** \`get_recurring_invoices\`, \`create_recurring_invoice\`, \`update_recurring_invoice\`, \`delete_recurring_invoice\` (soft-cancel).

## Vendors & Accounts Payable

**Disambiguation:**
- \`get_vendors\` — list vendors with payment details. Use to find a vendorId.
- \`get_vendor_statement\` — full statement for ONE vendor: bills, payments, outstanding.
- \`get_vendor_aging\` — AP aging by vendor: totals in current/30/60/90/90+ buckets.

**CRUD:** \`create_vendor\`, \`update_vendor\`, \`delete_vendor\` (soft-delete, fails if outstanding bills).

## Bills & Purchase Orders

**Workflow: PO -> Bill -> Payment**
1. \`create_purchase_order\` -> \`update_purchase_order_status\` (draft->approved->received)
2. \`create_bill\` — record vendor invoice. Needs vendorId and line items.
3. \`update_bill_status\` — advance through approval workflow.
4. \`record_payment\` — record payment to vendor.

**Disambiguation:**
- \`get_bills\` — vendor invoices/payables. \`get_purchase_orders\` — procurement orders.
- Bills are what you OWE, invoices are what you're OWED.

## Payments

- \`get_payments\` — list all inbound (customer) and outbound (vendor) payments.
- \`record_payment\` — record a new payment. Links to invoice or bill. **Confirm amount and entity with user.**

## Tags

- \`get_tags\` — list organizational tags with usage counts.
- \`create_tag\`, \`update_tag\`, \`delete_tag\` — manage tags. Delete removes all entity assignments.
- \`assign_tag\` — attach a tag to a customer, vendor, invoice, bill, quotation, or PO.

## Agreements

**Workflow:** \`get_contract_templates\` -> \`create_agreement\` -> \`update_agreement_status\` (draft->sent->signing->executed->active) -> \`create_billing_schedule\`

- \`get_agreements\` — list with status/type filters. \`get_agreement_detail\` — single agreement with signers and versions.
- \`get_clauses\` — reusable clause library. \`get_contract_templates\` — templates for new agreements.
- \`get_billing_schedules\` / \`create_billing_schedule\` — milestone-based billing linked to agreements.

## Data Room

- \`get_dataroom_folders\` — folder hierarchy (metadata only, no downloads).
- \`get_dataroom_files\` — file list with folder/search filters (metadata only).
- \`get_dataroom_file_detail\` — single file with versions and access info.
- \`search_dataroom\` — search by name, description, or type.
- \`get_dataroom_activity\` — audit trail: uploads, downloads, folder changes.
- \`create_dataroom_folder\` — create a new folder.

## Fixed Assets

**Workflow:** \`get_asset_categories\` -> \`create_fixed_asset\` -> \`update_asset_status\` (draft->active) -> \`get_depreciation_schedule\`

- \`get_fixed_assets\` — list with status/category filters. \`get_asset_detail\` — single asset with depreciation and capital allowance.
- \`get_asset_categories\` — categories with depreciation defaults.
- \`get_depreciation_schedule\` — depreciation entries for an asset or period.
- \`get_asset_summary\` — register summary by category and status.

## Admin (Read-Only)

- \`get_team_members\` — users with roles and status.
- \`get_staff_invitations\` — pending/accepted/expired invitations.
- \`get_organization_link_requests\` — pending org link requests.
- \`get_audit_trail\` — cross-module audit log with filters.
- \`get_entity_history\` — change history for a specific entity.
- \`get_einvoice_status\` — e-invoice credential status and submission stats.

## SQL Mode (Advanced)

For queries the typed tools cannot answer. Requires \`query:execute\` scope.
1. \`search_schema\` — **always call first** to discover tables and columns. Never guess schema.
2. \`execute_query\` — read-only SELECT with \`$TENANT_FILTER\` auto-injected. No CTEs, no OR (use IN), no UNION. Max 200 rows. **Show query to user before executing.**

## Code Mode (Programmable)

For multi-step workflows in a single round-trip. Requires \`code:execute\` scope.
1. \`search_tools\` — discover tools and get TypeScript signatures.
2. \`execute_code\` — run JavaScript calling \`cynco.*\` in a sandboxed environment. 60s timeout, 50 calls max.
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
