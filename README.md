<div align="center">
  <img src="assets/icon.png" alt="Cynco" width="80" />
  <h1>@cynco/mcp</h1>
  <p><strong>Connect your AI agent to your Cynco accounting data</strong></p>
  <p>Use Claude, Cursor, Windsurf, or any MCP-compatible AI to query your books,<br />create invoices, reconcile transactions, and generate financial reports.</p>

  <br />

  [![npm version](https://img.shields.io/npm/v/@cynco/mcp?color=0366D6&label=npm)](https://www.npmjs.com/package/@cynco/mcp)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

  <br />

  52 tools &middot; 4 guided prompts &middot; 3 reference guides

  <br />
  <br />
</div>

## How it works

```
You (AI Agent)  ──►  @cynco/mcp  ──►  Your Cynco Account
    Claude               │              Chart of Accounts
    Cursor               │              Invoices & Bills
    Windsurf             │              Bank Transactions
    Any MCP client       │              Financial Statements
                         │              Payments & More
                         │
                    Tenant-scoped
                    Your data only
```

The Cynco MCP server gives your AI agent **structured, read/write access** to your accounting data — scoped to your account, never anyone else's.

<br />

## Getting started

### 1. Get your MCP API key

Log in to [cynco.io](https://cynco.io) → **Settings** → **API Keys** → **Generate MCP Key**

Your key looks like `cak_abc123...` — save it securely, it's shown once.

> [!NOTE]
> MCP keys are scoped to your organization. Your AI agent can only access your data.

### 2. Connect your AI agent

Pick your client and paste the config:

#### Claude Desktop

Add to your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cynco": {
      "type": "streamable-http",
      "url": "https://mcp.cynco.io/mcp",
      "headers": {
        "Authorization": "Bearer cak_your_api_key_here"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add cynco --transport streamable-http https://mcp.cynco.io/mcp \
  --header "Authorization: Bearer cak_your_api_key_here"
```

#### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cynco": {
      "type": "streamable-http",
      "url": "https://mcp.cynco.io/mcp",
      "headers": {
        "Authorization": "Bearer cak_your_api_key_here"
      }
    }
  }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "cynco": {
      "type": "streamable-http",
      "url": "https://mcp.cynco.io/mcp",
      "headers": {
        "Authorization": "Bearer cak_your_api_key_here"
      }
    }
  }
}
```

### 3. Start asking questions

Once connected, your AI agent can:

- *"Show me the P&L for January"*
- *"Who owes us money? Show the AR aging"*
- *"Create an invoice for Acme Corp — 10 hours consulting at RM500/hr"*
- *"Categorize all the GRAB transactions as transport expense"*
- *"Run the month-end close for February"*
- *"What's our cash flow trend over the last 6 months?"*

<br />

## What your AI can do

**52 tools** across 14 domains:

### Orientation

| Tool | Description |
|------|-------------|
| `get_company_profile` | Your business profile, fiscal year, currency, industry — **AI calls this first** |
| `get_financial_summary` | Dashboard overview — balances, JE counts, AR/AP totals |

### Chart of Accounts

| Tool | Description |
|------|-------------|
| `get_chart_of_accounts` | Full COA with codes, types, hierarchy, AI mapping hints |
| `search_accounts` | Fuzzy search by name, code, or description |
| `get_account_balances` | Period-based balance snapshots with YTD totals |
| `get_account_activity` | Sub-ledger for a single account — every posting with running balance |

### Financial Accounts

| Tool | Description |
|------|-------------|
| `get_financial_accounts` | Your bank accounts and credit cards |

### Bank Transactions

| Tool | Description |
|------|-------------|
| `get_bank_transactions` | List transactions with categorization and GL link status |
| `search_bank_transactions` | Search by description, payee, category, or reference |
| `create_bank_transactions` | Import transactions with auto-dedup (max 500/call) |
| `update_bank_transaction_status` | Categorize, match, or link transactions (max 100/call) |
| `post_bank_transactions` | Post categorized transactions to GL as journal entries |

### Categorization Rules

| Tool | Description |
|------|-------------|
| `get_categorization_rules` | List auto-categorization rules |
| `create_categorization_rule` | Create pattern-matching rule (exact, contains, regex, payee) |
| `update_categorization_rule` | Modify or deactivate a rule |

### Journal Entries

| Tool | Description |
|------|-------------|
| `get_journal_entries` | List entries by period, status, or source |
| `search_journal_entries` | Search by description, memo, entry number, or vendor/customer |
| `create_journal_entries` | Create double-entry entries with balanced debit/credit lines |
| `update_journal_entry_status` | Post, approve, or void entries (with GL auto-posting) |

### Journal Entry Templates

| Tool | Description |
|------|-------------|
| `get_journal_entry_templates` | List reusable templates for recurring entries |
| `create_journal_entry_template` | Create template for rent, depreciation, payroll accruals |
| `apply_journal_entry_template` | Execute a template for a specific date |

### General Ledger & Trial Balance

| Tool | Description |
|------|-------------|
| `get_general_ledger` | GL postings with running balances and JE references |
| `get_trial_balance` | TB snapshots — preliminary, adjusted, or final |

### Financial Statements

| Tool | Description |
|------|-------------|
| `get_income_statement` | Profit & Loss — revenue, expenses, net income by period |
| `get_balance_sheet` | Assets, liabilities, equity with A = L + E balance check |
| `get_cash_flow_summary` | Monthly inflows, outflows, net cash flow from bank data |

### Customers & Accounts Receivable

| Tool | Description |
|------|-------------|
| `get_customers` | Customer list with outstanding balances and payment terms |
| `get_customer_statement` | Full statement of account — invoices, payments, credits |
| `get_customer_aging` | AR aging by customer (current, 1-30, 31-60, 61-90, 90+ days) |
| `get_invoice_aging_detail` | Invoice-level aging with days past due |

### Invoices

| Tool | Description |
|------|-------------|
| `get_invoices` | List invoices with line items, payments, outstanding balances |
| `create_invoice` | Create invoice with auto-generated number (INV-YYYY-NNNN) |
| `update_invoice_status` | Finalize, mark as paid, or void an invoice |
| `get_credit_debit_notes` | Credit/debit notes with applications and refund status |

### Vendors & Accounts Payable

| Tool | Description |
|------|-------------|
| `get_vendors` | Vendor list with outstanding bill counts and balances |
| `get_vendor_statement` | Full vendor statement — bills, payments, outstanding amounts |
| `get_vendor_aging` | AP aging by vendor (current, 1-30, 31-60, 61-90, 90+ days) |
| `get_bills` | Bills with paid/outstanding amounts and line items |
| `get_purchase_orders` | POs with vendor details and approval status |

### Payments

| Tool | Description |
|------|-------------|
| `get_payments` | All payments — inbound (customers) and outbound (vendors) |
| `record_payment` | Record a payment — auto-updates linked invoice status |

### Quotations & Recurring

| Tool | Description |
|------|-------------|
| `get_quotations` | Quotes with conversion tracking (accepted → invoice) |
| `get_recurring_invoices` | Recurring invoice templates and schedules |
| `get_tags` | Tags with usage counts across entities |

### Period Management & Reconciliation

| Tool | Description |
|------|-------------|
| `get_period_status` | All periods — open/closed, draft counts, readiness |
| `close_period` | Lock a period (prevents new entries) |
| `reopen_period` | Unlock a period (requires reason, audit trail) |
| `get_reconciliation_status` | Reconciled vs unreconciled GL entries per account |
| `reconcile_accounts` | Mark GL entries as reconciled (max 100/call) |

### Code Mode (Advanced)

| Tool | Description |
|------|-------------|
| `search_schema` | Discover tables, columns, types, and foreign keys |
| `execute_query` | Read-only SQL SELECT with auto tenant scoping (max 200 rows) |

<br />

## Guided Prompts

Multi-step workflows that walk your AI through complex tasks:

| Prompt | What it does |
|--------|-------------|
| `month_end_close` | Check drafts → reconcile → verify trial balance → close period |
| `categorize_transactions` | Review uncategorized transactions → suggest accounts → create rules |
| `financial_health_check` | Liquidity, profitability, AR/AP, cash flow analysis, red flags |
| `reconcile_bank_account` | Match GL entries to bank statement → mark reconciled → report |

<br />

## API Key Scopes

Your API key controls what the AI can do:

| Scope | Access |
|-------|--------|
| `read` | View data — reports, balances, statements, lists |
| `write` | Read + create/update — invoices, entries, payments, categorization |
| `query:execute` | Code Mode — direct SQL queries (opt-in, for power users) |

> [!IMPORTANT]
> Your AI agent can only access **your organization's data**. Every query is scoped to your tenant via database-level isolation. There is no way to access another organization's data.

<br />

## Security & Limits

| Feature | Detail |
|---------|--------|
| **Tenant isolation** | Every query filtered by your organization via SQL CHECK constraints |
| **Rate limiting** | 120 requests/minute per organization |
| **Scope enforcement** | API keys restricted to read, write, or query access |
| **SQL safety** | Code Mode blocks writes, CTEs, UNION, OR — whitelist only |
| **Session binding** | Sessions locked to your tenant, auto-expire after 1 hour |
| **Error masking** | Internal errors hidden — correlation IDs returned for support |

<br />

## Self-hosting

If you run your own Cynco instance, you can run the MCP server locally:

```bash
export CYNCO_DATABASE_URL="postgresql://user:pass@localhost:5432/cynco"
npx @cynco/mcp
```

Or with Docker:

```bash
docker build -t cynco-mcp .
docker run -p 3100:3100 \
  -e CYNCO_DATABASE_URL="postgresql://..." \
  -e MCP_TRANSPORT=http \
  cynco-mcp
```

<details>
<summary><strong>Environment variables</strong></summary>

<br />

| Variable | Required | Default | Description |
|----------|:--------:|:-------:|-------------|
| `CYNCO_DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `MCP_TRANSPORT` | | `stdio` | Transport: `stdio` or `http` |
| `MCP_PORT` | | `3100` | HTTP server port |
| `MCP_RATE_LIMIT` | | `120` | Requests/minute per tenant |
| `MCP_DB_POOL_MAX` | | `5` | Max DB pool connections |
| `MCP_DB_POOL_IDLE_TIMEOUT` | | `30000` | Idle connection timeout (ms) |
| `MCP_PUBLIC_URL` | | — | Public URL for resources |
| `LOG_LEVEL` | | `info` | `debug` · `info` · `warn` · `error` |

</details>

<details>
<summary><strong>HTTP endpoints</strong></summary>

<br />

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | `POST` | MCP requests (initialize or tool calls) |
| `/mcp` | `GET` | SSE stream for notifications |
| `/mcp` | `DELETE` | Terminate session |
| `/health` | `GET` | Liveness probe with DB pool stats |
| `/ready` | `GET` | Readiness probe |
| `/metrics` | `GET` | Prometheus metrics |

</details>

<details>
<summary><strong>Observability (Prometheus metrics)</strong></summary>

<br />

| Metric | Type | Description |
|--------|------|-------------|
| `mcp_requests_total` | Counter | Tool executions by name and status |
| `mcp_request_duration_seconds` | Histogram | Tool execution latency |
| `mcp_rate_limit_hits_total` | Counter | Rate limit violations |
| `mcp_auth_failures_total` | Counter | Auth failures |
| `mcp_db_pool_connections` | Gauge | DB pool stats |
| `mcp_active_sessions` | Gauge | Active HTTP sessions |

</details>

<br />

## Contributing

Found a bug or want a new tool? [Open an issue](https://github.com/cynco-tech/cynco-mcp/issues).

<br />

<div align="center">
  <p>
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white" alt="Zod" />
    <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
    <img src="https://img.shields.io/badge/MCP-191919?style=for-the-badge&logo=anthropic&logoColor=white" alt="MCP" />
  </p>
  <p><sub>Built by <a href="https://cynco.io">Cynco</a> — AI Native Accounting</sub></p>
</div>
