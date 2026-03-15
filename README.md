<div align="center">

# Cynco MCP Server

**AI-native accounting tools via the [Model Context Protocol](https://modelcontextprotocol.io)**

Connect Claude, Cursor, Windsurf, or any MCP-compatible AI agent to your Cynco accounting data.

52 tools &middot; 4 guided prompts &middot; 3 reference guides

[![npm](https://img.shields.io/npm/v/cynco-mcp?color=blue)](https://www.npmjs.com/package/cynco-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

</div>

---

## What is this?

Cynco MCP Server gives AI agents structured, tenant-scoped access to accounting data. Instead of asking an AI to read spreadsheets, you connect it directly to your books — chart of accounts, journal entries, invoices, bank transactions, financial statements, and more.

The server implements the [Model Context Protocol](https://modelcontextprotocol.io), the open standard for connecting AI to data sources.

## Quick Start

### Prerequisites

- Node.js 20+
- A Cynco account with a PostgreSQL database

### Option 1: npx (recommended)

No installation needed:

```bash
npx cynco-mcp
```

### Option 2: Install globally

```bash
npm install -g cynco-mcp
cynco-mcp
```

### Option 3: From source

```bash
git clone https://github.com/cynco-tech/cynco-mcp.git
cd cynco-mcp
npm install
npm run build
npm start
```

## Connecting to AI Agents

### Claude Desktop

Add to your `claude_desktop_config.json`:

<details>
<summary>macOS: <code>~/Library/Application Support/Claude/claude_desktop_config.json</code></summary>

```json
{
  "mcpServers": {
    "cynco-accounting": {
      "command": "npx",
      "args": ["-y", "cynco-mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

</details>

<details>
<summary>Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code></summary>

```json
{
  "mcpServers": {
    "cynco-accounting": {
      "command": "npx",
      "args": ["-y", "cynco-mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

</details>

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cynco-accounting": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "cynco-mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

Or connect to a remote server:

```json
{
  "mcpServers": {
    "cynco-accounting": {
      "type": "streamable-http",
      "url": "https://your-mcp-server.cynco.io/mcp",
      "headers": {
        "Authorization": "Bearer cak_your_api_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "cynco-accounting": {
      "command": "npx",
      "args": ["-y", "cynco-mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "cynco-accounting": {
      "command": "npx",
      "args": ["-y", "cynco-mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

## Tools (52)

### Orientation

| Tool | Description |
|------|-------------|
| `get_company_profile` | Get business profile, fiscal year, currency, industry context. **Call this first.** |
| `get_financial_summary` | Dashboard overview — balances by type, JE/transaction counts, AR/AP totals |

### Chart of Accounts

| Tool | Description |
|------|-------------|
| `get_chart_of_accounts` | Full COA with account codes, types, hierarchy, and AI mapping hints |
| `search_accounts` | Fuzzy search accounts by name, code, or description |
| `get_account_balances` | Period-based balance snapshots with YTD totals |
| `get_account_activity` | Sub-ledger detail for a single account with running balance |

### Financial Accounts (Banks)

| Tool | Description |
|------|-------------|
| `get_financial_accounts` | Bank accounts, credit cards — IDs needed for importing transactions |

### Bank Transactions

| Tool | Description |
|------|-------------|
| `get_bank_transactions` | List transactions with categorization and GL link status |
| `search_bank_transactions` | Search by description, payee, category, or reference |
| `create_bank_transactions` | Import transactions (auto-dedup via SHA-256). Max 500/call |
| `update_bank_transaction_status` | Categorize, match, or link transactions. Max 100/call |
| `post_bank_transactions` | Post categorized transactions to GL as journal entries |

### Categorization Rules

| Tool | Description |
|------|-------------|
| `get_categorization_rules` | List auto-categorization rules for bank transactions |
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
| `create_journal_entry_template` | Create template (rent, depreciation, payroll accruals) |
| `apply_journal_entry_template` | Execute template for a specific date |

### General Ledger & Trial Balance

| Tool | Description |
|------|-------------|
| `get_general_ledger` | GL postings with running balances and JE references |
| `get_trial_balance` | TB snapshots — preliminary, adjusted, or final |

### Financial Statements

| Tool | Description |
|------|-------------|
| `get_income_statement` | Profit & Loss — revenue, expenses, net income by period |
| `get_balance_sheet` | Assets, liabilities, equity snapshot with A = L + E check |
| `get_cash_flow_summary` | Monthly inflows, outflows, net cash flow from bank data |

### Customers & Accounts Receivable

| Tool | Description |
|------|-------------|
| `get_customers` | Customer list with outstanding balances and payment terms |
| `get_customer_statement` | Full SOA — invoices, payments, credits in date range |
| `get_customer_aging` | AR aging by customer (current, 1-30, 31-60, 61-90, 90+) |
| `get_invoice_aging_detail` | Invoice-level aging with days past due |

### Invoices

| Tool | Description |
|------|-------------|
| `get_invoices` | List invoices with line items, payments, outstanding balances |
| `create_invoice` | Create invoice with auto-generated number (INV-YYYY-NNNN) |
| `update_invoice_status` | Finalize, mark paid, or void an invoice |
| `get_credit_debit_notes` | List credit/debit notes with applications and refund status |

### Vendors & Accounts Payable

| Tool | Description |
|------|-------------|
| `get_vendors` | Vendor list with outstanding bill counts and balances |
| `get_vendor_statement` | Full vendor statement — bills, payments, outstanding amounts |
| `get_vendor_aging` | AP aging by vendor (current, 1-30, 31-60, 61-90, 90+) |

### Bills & Purchase Orders

| Tool | Description |
|------|-------------|
| `get_bills` | List bills with paid/outstanding amounts and line items |
| `get_purchase_orders` | List POs with vendor details and approval status |

### Payments

| Tool | Description |
|------|-------------|
| `get_payments` | List all payments — inbound (from customers) and outbound (to vendors) |
| `record_payment` | Record a payment, auto-updates linked invoice status |

### Quotations & Recurring

| Tool | Description |
|------|-------------|
| `get_quotations` | List quotes with conversion tracking (accepted → invoice) |
| `get_recurring_invoices` | List recurring invoice templates with schedules |

### Tags

| Tool | Description |
|------|-------------|
| `get_tags` | List tags with usage counts across entities |

### Period Management

| Tool | Description |
|------|-------------|
| `get_period_status` | Overview of all periods — open/closed, draft counts |
| `close_period` | Lock a period (prevents new entries) |
| `reopen_period` | Unlock a period (requires reason, audit trail) |

### Reconciliation

| Tool | Description |
|------|-------------|
| `get_reconciliation_status` | Reconciled vs unreconciled GL entries per account |
| `reconcile_accounts` | Mark GL entries as reconciled. Max 100/call |

### Code Mode (Advanced)

| Tool | Description |
|------|-------------|
| `search_schema` | Discover tables, columns, types, and foreign keys |
| `execute_query` | Read-only SQL SELECT with auto tenant scoping. Max 200 rows |

## Guided Prompts

Prompts are multi-step workflows that guide the AI through complex accounting tasks:

| Prompt | Description | Args |
|--------|-------------|------|
| `month_end_close` | Check drafts, reconcile, verify TB, close the period | `period` (YYYY-MM) |
| `categorize_transactions` | Review uncategorized transactions, suggest accounts, create rules | `financialAccountId` (optional) |
| `financial_health_check` | Comprehensive review — liquidity, profitability, AR/AP, cash flow, red flags | None |
| `reconcile_bank_account` | Match GL entries to bank statement, mark reconciled, report discrepancies | `financialAccountId` (required) |

## Authentication

### Local (stdio mode)

No authentication needed. The AI agent runs as a local process with direct database access. Tenant IDs are passed explicitly in each tool call.

### Remote (HTTP mode)

Uses API keys with Bearer token authentication:

```
Authorization: Bearer cak_your_api_key_here
```

**Generate a key:**

```bash
npx cynco-mcp generate-key \
  --name "My AI Agent" \
  --tenant-type client \
  --tenant-id client_01abc...
```

The raw key is shown **once**. Store it securely.

### Scopes

API keys can be restricted to specific access levels:

| Scope | Access |
|-------|--------|
| `read` | Read-only tools (get, search, list) |
| `write` | Read + write tools (create, update, post) |
| `query:execute` | Code Mode — direct SQL queries (explicit opt-in) |

Empty scopes array = full access (backwards compatible).

### First-Time Setup

Create the API key table before generating keys:

```bash
psql $CYNCO_DATABASE_URL -f migrations/001_mcp_api_keys.sql
```

## Architecture

```
            AI Agents (Claude, Cursor, Windsurf, etc.)
                │ stdio              │ HTTP + Bearer
                ▼                    ▼
          ┌──────────────────────────────────────┐
          │            Cynco MCP Server           │
          │                                       │
          │   stdio transport     HTTP transport   │
          │   (local dev)         (production)     │
          │        │                   │           │
          │        │         ┌─────────▼────────┐  │
          │        │         │  Auth + Scopes   │  │
          │        │         │  Rate Limiting   │  │
          │        │         │  Session Mgmt    │  │
          │        │         └────────┬─────────┘  │
          │        ▼                  ▼             │
          │   ┌──────────────────────────────────┐  │
          │   │     52 Tools · 4 Prompts          │  │
          │   │     3 Resource Guides             │  │
          │   │     Tenant Isolation              │  │
          │   └──────────────┬────────────────────┘  │
          │                  ▼                       │
          │   ┌──────────────────────────────────┐  │
          │   │  PostgreSQL (tenant-scoped)       │  │
          │   │  Every query filtered by tenant   │  │
          │   └──────────────────────────────────┘  │
          └──────────────────────────────────────────┘
```

### Transport Modes

| Mode | Auth | Tenant Resolution | Use Case |
|------|------|-------------------|----------|
| **stdio** | None (trusted local) | Explicit in each tool call | Local dev, personal use |
| **HTTP** | Bearer API key | Auto-injected from key | Teams, production, hosted |

### Security

- **Tenant isolation**: Every query is scoped to `clientId` XOR `accountingFirmId` via SQL CHECK constraints
- **Scope enforcement**: API keys are restricted by scope (read/write/query)
- **Rate limiting**: 120 req/min per tenant (configurable)
- **SQL safety**: `execute_query` blocks writes, CTEs, UNION, OR — whitelist validation
- **Error masking**: Internal DB errors are hidden in production
- **Session binding**: HTTP sessions cannot switch tenants

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CYNCO_DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `MCP_TRANSPORT` | No | `stdio` | Transport: `stdio` or `http` |
| `MCP_PORT` | No | `3100` | HTTP server port |
| `MCP_RATE_LIMIT` | No | `120` | Requests/minute per tenant |
| `MCP_DB_POOL_MAX` | No | `5` | Max DB pool connections (1-100) |
| `MCP_DB_POOL_IDLE_TIMEOUT` | No | `30000` | Idle connection timeout (ms) |
| `MCP_PUBLIC_URL` | No | — | Public URL for icon/resource URLs |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |

## Docker

```bash
docker build -t cynco-mcp .
docker run -p 3100:3100 \
  -e CYNCO_DATABASE_URL="postgresql://..." \
  -e MCP_TRANSPORT=http \
  cynco-mcp
```

Health check endpoint: `GET /health` (auto-checked every 30s).

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start in stdio mode
npm run dev:http     # Start in HTTP mode
npm run typecheck    # Type check
npm run test         # Run unit tests
npm run build        # Build to dist/
```

## HTTP Endpoints

When running in HTTP mode (`MCP_TRANSPORT=http`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP requests (initialize or tool calls) |
| `/mcp` | GET | SSE stream for server notifications |
| `/mcp` | DELETE | Terminate session |
| `/health` | GET | Liveness probe with DB pool stats |
| `/ready` | GET | Readiness probe |
| `/metrics` | GET | Prometheus metrics (text/plain) |

## Metrics

Built-in Prometheus metrics (no external dependencies):

| Metric | Type | Description |
|--------|------|-------------|
| `mcp_requests_total` | Counter | Tool executions by tool name and status |
| `mcp_request_duration_seconds` | Histogram | Tool execution latency |
| `mcp_rate_limit_hits_total` | Counter | Rate limit violations by tenant type |
| `mcp_auth_failures_total` | Counter | Authentication failures by reason |
| `mcp_db_pool_connections` | Gauge | DB pool stats (total/idle/waiting) |
| `mcp_active_sessions` | Gauge | Active HTTP sessions |

## License

MIT
