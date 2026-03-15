import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  server.registerResource("getting-started", "cynco://guide/getting-started", {
    title: "Getting Started Guide",
    description: "How to use the Cynco Accounting MCP server effectively.",
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
}

const GETTING_STARTED = `# Cynco Accounting MCP Server — Getting Started

## First Steps
1. Call \`get_company_profile\` to understand the business you're working with
2. Call \`get_financial_summary\` for a high-level overview of the financial position
3. Call \`get_chart_of_accounts\` with \`compact=true\` to see the account structure

## Key Concepts
- **Tenant isolation**: Every query is scoped to a single tenant (client or accounting firm). In HTTP mode, your API key determines the tenant. In stdio mode, pass \`clientId\` or \`accountingFirmId\`.
- **Double-entry accounting**: Every transaction has balanced debits and credits. Use \`create_journal_entries\` to create entries with matching debit/credit lines.
- **Periods**: Accounting periods are formatted as \`YYYY-MM\`. Use \`get_period_status\` to check which periods are open/closed.

## Tool Categories
| Category | Tools | When to use |
|----------|-------|-------------|
| **Read** | get_chart_of_accounts, get_journal_entries, get_bank_transactions, get_general_ledger, get_trial_balance, get_account_balances, get_financial_accounts, get_categorization_rules | Querying data |
| **Write** | create_journal_entries, create_bank_transactions, update_journal_entry_status, update_bank_transaction_status, post_bank_transactions, create_categorization_rule, update_categorization_rule | Creating/modifying data |
| **Reports** | get_income_statement, get_balance_sheet, get_vendor_aging, get_customer_aging, get_cash_flow_summary, get_financial_summary, get_customer_statement, get_invoice_aging_detail | Financial reports |
| **Search** | search_accounts, search_journal_entries, search_bank_transactions | Finding specific items |
| **Code Mode** | search_schema, execute_query | Direct SQL for anything the typed tools don't cover |

## Code Mode (Advanced)
For questions the typed tools can't answer, use Code Mode:
1. Call \`search_schema\` to discover tables and columns
2. Call \`execute_query\` with a SQL SELECT query using \`$TENANT_FILTER\` placeholder
3. The placeholder is automatically replaced with the correct tenant filter

Example: \`SELECT COUNT(*) FROM journal_entries WHERE $TENANT_FILTER AND status = 'posted'\`

## Tips
- Use \`compact=true\` on list tools to reduce token usage
- Use \`search_accounts\` to find the right COA account before creating journal entries
- Always check \`get_period_status\` before attempting to create entries in a period
- Use prompts (month_end_close, categorize_transactions, financial_health_check, reconcile_bank_account) for guided multi-step workflows
`;

const WORKFLOWS = `# Common Accounting Workflows

## 1. Import and Categorize Bank Transactions
\`\`\`
get_financial_accounts              → Find the bank account ID
create_bank_transactions            → Import transactions (auto-deduplicates)
get_bank_transactions(status=imported) → Review imported transactions
search_accounts                     → Find matching COA accounts
update_bank_transaction_status      → Set category on each transaction
post_bank_transactions              → Create journal entries from categorized transactions
\`\`\`

## 2. Month-End Close
\`\`\`
get_period_status                   → Check period is open
get_journal_entries(status=draft)   → Review and post/void drafts
get_reconciliation_status           → Ensure accounts are reconciled
get_trial_balance                   → Verify debits = credits
get_income_statement + get_balance_sheet → Review financial statements
close_period                        → Lock the period
\`\`\`

## 3. Create a Recurring Journal Entry
\`\`\`
get_chart_of_accounts(compact=true) → Get account IDs
create_journal_entry_template       → Create template with balanced lines
apply_journal_entry_template        → Apply for a specific date
update_journal_entry_status(posted) → Post the entry
\`\`\`

## 4. Reconcile Bank Account
\`\`\`
get_financial_accounts              → Find account and linked COA
get_bank_transactions               → Bank-side transactions
get_general_ledger                  → GL-side entries
                                    → Match by amount + date
reconcile_accounts                  → Mark matched GL entries as reconciled
get_reconciliation_status           → Verify reconciliation
\`\`\`

## 5. Customer Collections Review
\`\`\`
get_customer_aging                  → Overview of overdue receivables
get_invoice_aging_detail            → Drill into specific overdue invoices
get_customer_statement              → Full statement for a specific customer
\`\`\`

## 6. Financial Analysis
\`\`\`
get_company_profile                 → Business context
get_financial_summary               → High-level overview
get_income_statement                → Revenue and expenses
get_balance_sheet                   → Assets, liabilities, equity
get_cash_flow_summary               → Cash position and trends
get_customer_aging + get_vendor_aging → Working capital analysis
\`\`\`
`;

const CONVENTIONS = `# Accounting Conventions

## Double-Entry Bookkeeping
Every transaction must have equal debits and credits. The accounting equation must always hold:
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

## Journal Entry Lifecycle
\`\`\`
draft → posted → approved
  ↓       ↓        ↓
voided  voided   voided
\`\`\`
- **Draft**: Created but not yet affecting the GL
- **Posted**: Active in the GL, affects account balances
- **Approved**: Reviewed and confirmed
- **Voided**: Reversed, no longer affects the GL

## Bank Transaction Lifecycle
\`\`\`
imported → categorized → posted → reconciled
\`\`\`

## Currency
All amounts are stored in the tenant's base currency (typically MYR for Malaysian businesses). Amounts use 2 decimal places.

## TypeID Prefixes
Identifiers use TypeID format with prefixes:
- \`client_\` — Client (business entity)
- \`accfirm_\` — Accounting firm
- \`user_\` — User account
- \`coa_\` — Chart of Accounts
- \`jnl_\` — Journal Entry
- \`btx_\` — Bank Transaction
- \`fin_\` — Financial Institution
- \`fac_\` — Financial Account
- \`inv_\` — Invoice
- \`cust_\` — Customer
- \`vend_\` — Vendor
`;
