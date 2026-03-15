<div align="center">
  <img src="assets/icon.png" alt="Cynco" width="80" />
  <h1>@cynco/mcp</h1>
  <p><strong>AI-native accounting tools via the <a href="https://modelcontextprotocol.io">Model Context Protocol</a></strong></p>
  <p>Connect Claude, Cursor, Windsurf, or any MCP-compatible AI agent to your accounting data.</p>

  <br />

  [![npm version](https://img.shields.io/npm/v/@cynco/mcp?color=0366D6&label=npm)](https://www.npmjs.com/package/@cynco/mcp)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

  <br />

  52 tools &middot; 4 guided prompts &middot; 3 reference guides &middot; tenant-scoped &middot; production-ready

  <br />
  <br />
</div>

## Overview

Cynco MCP Server gives AI agents structured, tenant-scoped access to accounting data — chart of accounts, journal entries, invoices, bank transactions, financial statements, and more.

Instead of asking an AI to read spreadsheets, you connect it directly to the books.

<br />

## Setup

> **Prerequisites** — Node.js 20+ and a Cynco account with a PostgreSQL database.

### Claude Desktop

Add to your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cynco": {
      "command": "npx",
      "args": ["-y", "@cynco/mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add cynco -- npx -y @cynco/mcp
```

Or add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "cynco": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cynco/mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
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
    "cynco": {
      "command": "npx",
      "args": ["-y", "@cynco/mcp"],
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
    "cynco": {
      "command": "npx",
      "args": ["-y", "@cynco/mcp"],
      "env": {
        "CYNCO_DATABASE_URL": "postgresql://user:pass@localhost:5432/cynco"
      }
    }
  }
}
```

### HTTP Transport (Remote)

For team or production use, connect to a hosted instance:

```json
{
  "mcpServers": {
    "cynco": {
      "type": "streamable-http",
      "url": "https://your-mcp-server.cynco.io/mcp",
      "headers": {
        "Authorization": "Bearer cak_your_api_key_here"
      }
    }
  }
}
```

<br />

## Features

**52 tools** across 14 domains — everything an AI agent needs to work with accounting data.

### Orientation

| Tool | Description |
|------|-------------|
| `get_company_profile` | Business profile, fiscal year, currency, industry context — **call this first** |
| `get_financial_summary` | Dashboard overview — balances by type, JE/transaction counts, AR/AP totals |

### Chart of Accounts

| Tool | Description |
|------|-------------|
| `get_chart_of_accounts` | Full COA with account codes, types, hierarchy, and AI mapping hints |
| `search_accounts` | Fuzzy search by name, code, or description — for finding account IDs |
| `get_account_balances` | Period-based balance snapshots with opening, closing, and YTD totals |
| `get_account_activity` | Sub-ledger for a single account — every posting with running balance |

### Financial Accounts

| Tool | Description |
|------|-------------|
| `get_financial_accounts` | Bank accounts and credit cards — IDs needed for importing transactions |

### Bank Transactions

| Tool | Description |
|------|-------------|
| `get_bank_transactions` | List transactions with categorization and GL link status |
| `search_bank_transactions` | Search by description, payee, category, or reference |
| `create_bank_transactions` | Import transactions with auto-dedup via SHA-256 (max 500/call) |
| `update_bank_transaction_status` | Categorize, match, or link transactions (max 100/call) |
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
| `get_customer_statement` | Full SOA — invoices, payments, credits in date range |
| `get_customer_aging` | AR aging by customer (current, 1-30, 31-60, 61-90, 90+ days) |
| `get_invoice_aging_detail` | Invoice-level aging with days past due |

### Invoices

| Tool | Description |
|------|-------------|
| `get_invoices` | List invoices with line items, payments, outstanding balances |
| `create_invoice` | Create invoice with auto-generated number (INV-YYYY-NNNN) |
| `update_invoice_status` | Finalize, mark as paid, or void an invoice |
| `get_credit_debit_notes` | List credit/debit notes with applications and refund status |

### Vendors & Accounts Payable

| Tool | Description |
|------|-------------|
| `get_vendors` | Vendor list with outstanding bill counts and balances |
| `get_vendor_statement` | Full vendor statement — bills, payments, outstanding amounts |
| `get_vendor_aging` | AP aging by vendor (current, 1-30, 31-60, 61-90, 90+ days) |
| `get_bills` | List bills with paid/outstanding amounts and line items |
| `get_purchase_orders` | List POs with vendor details and approval status |

### Payments

| Tool | Description |
|------|-------------|
| `get_payments` | List all payments — inbound (customers) and outbound (vendors) |
| `record_payment` | Record a payment — auto-updates linked invoice status |

### Quotations & Recurring

| Tool | Description |
|------|-------------|
| `get_quotations` | List quotes with conversion tracking (accepted → invoice) |
| `get_recurring_invoices` | List recurring invoice templates and schedules |
| `get_tags` | List tags with usage counts across entities |

### Period Management & Reconciliation

| Tool | Description |
|------|-------------|
| `get_period_status` | All periods — open/closed status, draft counts, readiness |
| `close_period` | Lock a period (prevents new entries) |
| `reopen_period` | Unlock a period (requires reason, creates audit trail) |
| `get_reconciliation_status` | Reconciled vs unreconciled GL entries per account |
| `reconcile_accounts` | Mark GL entries as reconciled (max 100/call) |

### Code Mode

| Tool | Description |
|------|-------------|
| `search_schema` | Discover tables, columns, types, and foreign keys |
| `execute_query` | Read-only SQL SELECT with automatic tenant scoping (max 200 rows) |

<br />

## Guided Prompts

Multi-step workflows that guide the AI through complex accounting tasks:

| Prompt | Description |
|--------|-------------|
| `month_end_close` | Check drafts → reconcile → verify TB → close period |
| `categorize_transactions` | Review uncategorized transactions → suggest accounts → create rules |
| `financial_health_check` | Liquidity, profitability, AR/AP, cash flow analysis, red flags |
| `reconcile_bank_account` | Match GL entries to bank statement → mark reconciled → report |

<br />

## Authentication

### Local (stdio)

No auth needed. Tenant IDs are passed explicitly in each tool call. Perfect for local development and personal use.

### Remote (HTTP)

Bearer token authentication with scope-based access control:

```
Authorization: Bearer cak_your_api_key_here
```

**Generate a key:**

```bash
npx @cynco/mcp generate-key \
  --name "My AI Agent" \
  --tenant-type client \
  --tenant-id client_01abc...
```

> [!NOTE]
> The raw key is shown **once**. Store it securely.

**Scopes:**

| Scope | Access |
|-------|--------|
| `read` | Read-only tools (get, search, list) |
| `write` | Read + write tools (create, update, post) |
| `query:execute` | Code Mode — direct SQL queries (explicit opt-in) |

**First-time setup** — create the API key table:

```bash
psql $CYNCO_DATABASE_URL -f migrations/001_mcp_api_keys.sql
```

<br />

## Security

- **Tenant isolation** — every query scoped by `clientId` XOR `accountingFirmId` via SQL CHECK constraints
- **Scope enforcement** — API keys restricted by scope (read / write / query)
- **Rate limiting** — 120 req/min per tenant (configurable)
- **SQL safety** — `execute_query` blocks writes, CTEs, UNION, OR — whitelist validation only
- **Error masking** — internal DB errors hidden in production, correlation IDs returned
- **Session binding** — HTTP sessions locked to authenticated tenant, auto-expire after 1 hour

<br />

## Configuration

| Variable | Required | Default | Description |
|----------|:--------:|:-------:|-------------|
| `CYNCO_DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `MCP_TRANSPORT` | | `stdio` | Transport: `stdio` or `http` |
| `MCP_PORT` | | `3100` | HTTP server port |
| `MCP_RATE_LIMIT` | | `120` | Requests/minute per tenant |
| `MCP_DB_POOL_MAX` | | `5` | Max DB pool connections (1-100) |
| `MCP_DB_POOL_IDLE_TIMEOUT` | | `30000` | Idle connection timeout (ms) |
| `MCP_PUBLIC_URL` | | — | Public URL for icon/resource URLs |
| `LOG_LEVEL` | | `info` | `debug` · `info` · `warn` · `error` |

<br />

## HTTP Endpoints

When running with `MCP_TRANSPORT=http`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | `POST` | MCP requests (initialize or tool calls) |
| `/mcp` | `GET` | SSE stream for server notifications |
| `/mcp` | `DELETE` | Terminate session |
| `/health` | `GET` | Liveness probe with DB pool stats |
| `/ready` | `GET` | Readiness probe |
| `/metrics` | `GET` | Prometheus metrics |

<br />

## Observability

Built-in Prometheus metrics — no external dependencies:

| Metric | Type | Description |
|--------|------|-------------|
| `mcp_requests_total` | Counter | Tool executions by name and status |
| `mcp_request_duration_seconds` | Histogram | Tool execution latency |
| `mcp_rate_limit_hits_total` | Counter | Rate limit violations |
| `mcp_auth_failures_total` | Counter | Authentication failures |
| `mcp_db_pool_connections` | Gauge | DB pool stats (total/idle/waiting) |
| `mcp_active_sessions` | Gauge | Active HTTP sessions |

<br />

## Docker

```bash
docker build -t cynco-mcp .
docker run -p 3100:3100 \
  -e CYNCO_DATABASE_URL="postgresql://..." \
  -e MCP_TRANSPORT=http \
  cynco-mcp
```

Health check at `GET /health` — auto-checked every 30 seconds.

<br />

## Local Development

```bash
git clone https://github.com/cynco-tech/cynco-mcp.git
cd cynco-mcp
npm install
```

```bash
npm run dev          # stdio mode
npm run dev:http     # HTTP mode on :3100
npm run typecheck    # type check
npm run test         # unit tests
npm run build        # build to dist/
```

<br />

## Architecture

```
              AI Agents
              Claude · Cursor · Windsurf
                  │
        ┌─────────┴──────────┐
        │ stdio               │ HTTP + Bearer
        ▼                     ▼
  ┌──────────────────────────────────────┐
  │          @cynco/mcp                  │
  │                                      │
  │   52 Tools · 4 Prompts · 3 Guides   │
  │   Tenant Isolation · Scope RBAC     │
  │   Rate Limiting · Metrics            │
  │                                      │
  └──────────────┬───────────────────────┘
                 │
                 ▼
  ┌──────────────────────────────────────┐
  │   PostgreSQL (tenant-scoped)         │
  │   Every query filtered by tenant     │
  └──────────────────────────────────────┘
```

| Mode | Auth | Tenant | Use Case |
|------|------|--------|----------|
| **stdio** | None | Explicit per call | Local dev, personal use |
| **HTTP** | Bearer key | Auto-injected | Teams, production |

<br />

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/MCP-000000?style=for-the-badge&logo=anthropic&logoColor=white" alt="MCP" />
</p>

<br />

## License

MIT
