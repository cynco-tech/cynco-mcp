<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/icon-light.png" />
    <source media="(prefers-color-scheme: light)" srcset="assets/icon.png" />
    <img src="assets/icon.png" alt="Cynco" width="80" />
  </picture>
  <h1>@cynco/mcp</h1>
  <p><strong>Connect your AI agent to your Cynco accounting data</strong></p>
  <p>Use Claude, Cursor, Windsurf, or any MCP-compatible AI to query your books,<br />create invoices, reconcile transactions, and generate financial reports.</p>

  <br />

  [![npm version](https://img.shields.io/npm/v/@cynco/mcp?color=0366D6&label=npm)](https://www.npmjs.com/package/@cynco/mcp)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
  [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

  <br />

  107 tools &middot; 9 guided prompts &middot; 4 reference guides &middot; Code Mode

  <br />
  <br />
</div>

## How it works

```
You (AI Agent)  ──►  @cynco/mcp  ──►  Your Cynco Account
    Claude               │              Chart of Accounts
    Cursor               │              Invoices & Bills
    Windsurf             │              Bank Transactions
    Any MCP client       │              Financial Reports
                         │              Agreements & Contracts
                         │              Fixed Assets
                         │              Data Room & More
                         │
                    Tenant-scoped
                    Your data only
```

The Cynco MCP server gives your AI agent **structured, read/write access** to your accounting data — scoped to your account, never anyone else's.

<br />

## Getting started

### 1. Get your MCP API key

Log in to [cynco.io](https://cynco.io) → **MCP Keys** → **Create MCP Key**

Your key looks like `cak_abc123...` — save it securely, it's shown once.

> [!NOTE]
> MCP keys are scoped to your organization. Your AI agent can only access your data.

### 2. Connect your AI agent

Pick your client and paste the config:

#### Claude Code

```bash
claude mcp add cynco --transport streamable-http https://mcp.cynco.io/mcp \
  --header "Authorization: Bearer cak_your_api_key_here"
```

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
      "serverUrl": "https://mcp.cynco.io/mcp",
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
- *"Review the fixed asset register and flag fully depreciated items"*
- *"Create an MSA with Company X using our standard template"*
- *"Organize the data room — find orphaned files and suggest folders"*

<br />

## What your AI can do

**107 tools** across 15 modules — everything from chart of accounts to contract management.

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
| `create_account` | Create a new account with code, type, and parent |
| `update_account` | Update account name, description, or status |
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

### General Ledger & Reports

| Tool | Description |
|------|-------------|
| `get_general_ledger` | GL postings with running balances and JE references |
| `get_trial_balance` | TB snapshots — preliminary, adjusted, or final |
| `get_income_statement` | Profit & Loss — revenue, expenses, net income by period |
| `get_balance_sheet` | Assets, liabilities, equity with A = L + E balance check |
| `get_cash_flow_summary` | Monthly inflows, outflows, net cash flow from bank data |

### Customers & Accounts Receivable

| Tool | Description |
|------|-------------|
| `get_customers` | Customer list with outstanding balances and payment terms |
| `create_customer` | Create a new customer with contact and payment details |
| `update_customer` | Update customer details — name, email, terms, address |
| `delete_customer` | Soft-delete a customer (deactivate) |
| `get_customer_statement` | Full statement of account — invoices, payments, credits |
| `get_customer_aging` | AR aging by customer (current, 1-30, 31-60, 61-90, 90+ days) |
| `get_invoice_aging_detail` | Invoice-level aging with days past due |

### Invoices & Billing

| Tool | Description |
|------|-------------|
| `get_invoices` | List invoices with line items, payments, outstanding balances |
| `create_invoice` | Create invoice with auto-generated number (INV-YYYY-NNNN) |
| `update_invoice_status` | Finalize, mark as paid, or void an invoice |
| `get_credit_debit_notes` | Credit/debit notes with applications and refund status |
| `create_credit_debit_note` | Issue a credit or debit note against an invoice |
| `get_quotations` | Quotes with conversion tracking (accepted → invoice) |
| `create_quotation` | Create a draft quotation for a customer |
| `update_quotation_status` | Send, accept, reject, or convert a quotation |
| `get_recurring_invoices` | Recurring invoice templates and schedules |
| `create_recurring_invoice` | Set up automatic invoice generation |
| `update_recurring_invoice` | Modify frequency, amount, or next run date |
| `delete_recurring_invoice` | Remove a recurring invoice template |
| `get_items` | Product/service items with pricing and tax settings |
| `create_item` | Create a new product or service item |
| `update_item` | Update item details — name, price, tax rate |
| `delete_item` | Soft-delete an item |

### Vendors & Accounts Payable

| Tool | Description |
|------|-------------|
| `get_vendors` | Vendor list with outstanding bill counts and balances |
| `create_vendor` | Create a new vendor with contact and payment details |
| `update_vendor` | Update vendor details — name, email, terms, bank info |
| `delete_vendor` | Soft-delete a vendor (deactivate) |
| `get_vendor_statement` | Full vendor statement — bills, payments, outstanding amounts |
| `get_vendor_aging` | AP aging by vendor (current, 1-30, 31-60, 61-90, 90+ days) |
| `get_bills` | Bills with paid/outstanding amounts and line items |
| `create_bill` | Create a new bill from a vendor |
| `update_bill_status` | Approve, mark as paid, or void a bill |
| `get_purchase_orders` | POs with vendor details and approval status |
| `create_purchase_order` | Create a purchase order for a vendor |
| `update_purchase_order_status` | Approve, receive, or close a purchase order |

### Payments

| Tool | Description |
|------|-------------|
| `get_payments` | All payments — inbound (customers) and outbound (vendors) |
| `record_payment` | Record a payment — auto-updates linked invoice/bill status |

### Tags

| Tool | Description |
|------|-------------|
| `get_tags` | Tags with usage counts across entities |
| `create_tag` | Create a new tag for categorization |
| `update_tag` | Update tag name or color |
| `delete_tag` | Remove a tag |
| `assign_tag` | Assign a tag to any entity (invoice, bill, JE, etc.) |

### Period Management & Reconciliation

| Tool | Description |
|------|-------------|
| `get_period_status` | All periods — open/closed, draft counts, readiness |
| `close_period` | Lock a period (prevents new entries) |
| `reopen_period` | Unlock a period (requires reason, audit trail) |
| `get_reconciliation_status` | Reconciled vs unreconciled GL entries per account |
| `reconcile_accounts` | Mark GL entries as reconciled (max 100/call) |

### Agreements & Contracts

| Tool | Description |
|------|-------------|
| `get_agreements` | List agreements with status, counterparty, and value |
| `get_agreement_detail` | Full agreement with clauses, signers, and timeline |
| `create_agreement` | Create from template or scratch — NDA, MSA, SOW, engagement letter |
| `update_agreement_status` | Move through lifecycle: draft → sent → signing → executed |
| `get_clauses` | Browse the clause library for reuse |
| `get_contract_templates` | Available templates by agreement type |
| `get_billing_schedules` | Billing milestones linked to agreements |
| `create_billing_schedule` | Set up milestone-based or recurring billing |

### Data Room

| Tool | Description |
|------|-------------|
| `get_dataroom_folders` | Folder structure and hierarchy |
| `get_dataroom_files` | Files with metadata, sizes, and upload dates |
| `get_dataroom_file_detail` | Detailed file info — versions, access log, linked entities |
| `search_dataroom` | Search files by name, description, or content |
| `get_dataroom_activity` | Activity log — uploads, downloads, access events |
| `create_dataroom_folder` | Create a new folder in the data room |

### Fixed Assets

| Tool | Description |
|------|-------------|
| `get_fixed_assets` | Asset register with cost, book value, and depreciation |
| `get_asset_detail` | Full asset details — purchase, depreciation, maintenance |
| `create_fixed_asset` | Register a new fixed asset |
| `update_asset_status` | Activate, dispose, or mark for sale |
| `get_asset_categories` | Asset categories with depreciation methods and rates |
| `get_depreciation_schedule` | Depreciation entries by period |
| `get_asset_summary` | Summary by category — total cost, NBV, depreciation |

### Admin & Audit

| Tool | Description |
|------|-------------|
| `get_team_members` | Team members with roles and permissions |
| `get_staff_invitations` | Pending staff invitations |
| `get_organization_link_requests` | Pending org link requests (accounting firm ↔ client) |
| `get_audit_trail` | Full audit log — who changed what, when |
| `get_entity_history` | Version history for a specific entity |
| `get_einvoice_status` | E-invoice submission status and LHDN compliance |

### Code Mode

| Tool | Description |
|------|-------------|
| `search_tools` | Discover tools by keyword — returns TypeScript type signatures |
| `execute_code` | Run JavaScript in a sandbox — call multiple tools in one round-trip |

### SQL Mode

| Tool | Description |
|------|-------------|
| `search_schema` | Discover tables, columns, types, and foreign keys |
| `execute_query` | Read-only SQL SELECT with auto tenant scoping (max 200 rows) |

<br />

## Code Mode

Code Mode lets your AI call multiple tools in a single round-trip — saving **~90% in token overhead** for complex workflows.

Instead of the LLM making 6 individual tool calls (~15K tokens of tool definitions per call), it writes one script:

```javascript
const profile = await cynco.get_company_profile({});
const summary = await cynco.get_financial_summary({});
const bs = await cynco.get_balance_sheet({});
const aging = await cynco.get_customer_aging({});

console.log({
  company: profile.data.name,
  revenue: summary.data.totalRevenue,
  assets: bs.data.totalAssets,
  overdue: aging.data.totalOverdue,
});
```

**How it works:**
1. `search_tools({ query: "invoices" })` — discover tools, get TypeScript type signatures
2. `execute_code({ code: "..." })` — run the script, all `cynco.*` calls execute server-side

**Security:** Scripts run in a `node:vm` sandbox — no `process`, `require`, `import`, `fetch`, or `eval`.
**Limits:** 60s timeout, 50 tool calls per script, 10KB script, 50KB output.
**Auth:** Each `cynco.*` call enforces the same scopes as direct tool calls.

Requires `code:execute` scope on the API key.

<br />

## Guided Prompts

Multi-step workflows that walk your AI through complex tasks:

| Prompt | What it does |
|--------|-------------|
| `month_end_close` | Check drafts → reconcile → verify trial balance → close period |
| `categorize_transactions` | Review uncategorized transactions → suggest accounts → create rules |
| `financial_health_check` | Liquidity, profitability, AR/AP, cash flow analysis, red flags |
| `reconcile_bank_account` | Match GL entries to bank statement → mark reconciled → report |
| `code_mode_intro` | Learn how to use Code Mode for efficient multi-step workflows |
| `create_agreement` | Guided agreement creation — template, terms, signers, billing |
| `asset_register_review` | Review fixed assets, depreciation, disposals, and anomalies |
| `vendor_payment_run` | AP aging → prioritize payments → record batch → summary |
| `data_room_organize` | Audit folder structure → find orphans/dupes → reorganize |

<br />

## API Key Scopes

Control exactly what your AI agent can access with granular, module-level scopes:

| Scope | Access |
|-------|--------|
| `accounting:read` | COA, bank transactions, journal entries, GL, periods, reconciliation |
| `accounting:write` | Create/update above *(implies `accounting:read`)* |
| `invoicing:read` | Invoices, quotations, recurring invoices, items, credit/debit notes |
| `invoicing:write` | Create/update above *(implies `invoicing:read`)* |
| `customers:read` | Customer list, statements, aging |
| `customers:write` | Create/update/delete customers *(implies `customers:read`)* |
| `vendors:read` | Vendors, bills, purchase orders, vendor aging |
| `vendors:write` | Create/update/delete above *(implies `vendors:read`)* |
| `reports:read` | Financial summary, trial balance, income statement, balance sheet, cash flow |
| `tags:read` / `tags:write` | Tag management |
| `agreements:read` / `agreements:write` | Agreements, clauses, templates, billing schedules |
| `dataroom:read` / `dataroom:write` | Data room folders, files, search, activity |
| `assets:read` / `assets:write` | Fixed assets, categories, depreciation |
| `admin:read` | Team, invitations, audit trail, e-invoice status |
| `query:execute` | SQL Mode — raw read-only SQL *(explicit opt-in)* |
| `code:execute` | Code Mode — sandboxed script execution *(explicit opt-in)* |

**Legacy scopes:** `read` grants all `:read` scopes. `write` grants all `:write` scopes. Empty scopes = full access (backwards compatible with existing keys).

> [!IMPORTANT]
> Your AI agent can only access **your organization's data**. Every query is scoped to your tenant via database-level isolation. There is no way to access another organization's data.

<br />

## Security & Limits

| Feature | Detail |
|---------|--------|
| **Tenant isolation** | Every query filtered by your organization via SQL CHECK constraints |
| **Rate limiting** | 120 requests/minute per organization |
| **Scope enforcement** | API keys restricted to specific modules — read, write, or execute |
| **API key hashing** | Keys stored as SHA-256 hashes — raw key shown once on creation |
| **SQL safety** | SQL Mode blocks writes, CTEs, UNION, OR — whitelist only |
| **Code sandbox** | Code Mode runs in `node:vm` — no filesystem, network, or process access |
| **Session binding** | Sessions locked to your tenant, auto-expire after 1 hour |
| **Error masking** | Internal errors hidden — correlation IDs returned for support |
| **OAuth support** | RFC 9728 protected resource metadata for OAuth integrations |

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
| `MCP_TOOL_TIMEOUT_MS` | | `30000` | Individual tool execution timeout (ms) |
| `MCP_CODE_TIMEOUT_MS` | | `60000` | Code Mode script timeout (ms) |
| `MCP_PUBLIC_URL` | | — | Public URL for resource URIs |
| `LOG_LEVEL` | | `info` | `debug` · `info` · `warn` · `error` |

</details>

<details>
<summary><strong>HTTP endpoints</strong></summary>

<br />

| Endpoint | Method | Auth | Description |
|----------|--------|:----:|-------------|
| `/mcp` | `POST` | Yes | MCP requests (initialize or tool calls) |
| `/mcp` | `GET` | Yes | SSE stream for server-sent notifications |
| `/mcp` | `DELETE` | Yes | Terminate session |
| `/health` | `GET` | No | Liveness probe with DB pool stats |
| `/ready` | `GET` | No | Readiness probe |
| `/metrics` | `GET` | No | Prometheus metrics |
| `/icon.png` | `GET` | No | Server icon |
| `/.well-known/mcp.json` | `GET` | No | MCP service descriptor (capabilities, auth) |
| `/.well-known/oauth-protected-resource` | `GET` | No | RFC 9728 OAuth metadata |

</details>

<details>
<summary><strong>Observability (Prometheus metrics)</strong></summary>

<br />

| Metric | Type | Description |
|--------|------|-------------|
| `mcp_requests_total` | Counter | Tool executions by name and status |
| `mcp_request_duration_seconds` | Histogram | Tool execution latency |
| `mcp_rate_limit_hits_total` | Counter | Rate limit violations |
| `mcp_auth_failures_total` | Counter | Auth failures by reason |
| `mcp_db_pool_connections` | Gauge | DB pool stats (total, idle, waiting) |
| `mcp_active_sessions` | Gauge | Active HTTP sessions |

</details>

<details>
<summary><strong>Development</strong></summary>

<br />

```bash
pnpm install
pnpm dev              # stdio mode
pnpm dev:http         # HTTP mode on :3100
pnpm test             # Unit tests (296 tests)
pnpm test:integration # Integration tests (requires PostgreSQL)
pnpm typecheck        # Type check
pnpm build            # Build to dist/
```

### Project structure

```
src/
├── index.ts           # Entry point — stdio/HTTP transports, sessions, rate limiting
├── server.ts          # Tool registration (107 tools, prompts, resources)
├── auth.ts            # API key + OAuth resolution, scope checking
├── scope-map.ts       # Tool → scope mappings
├── db.ts              # PostgreSQL pool, transactions, health checks
├── logger.ts          # Structured JSON logging
├── metrics.ts         # Prometheus counters, histograms, gauges
├── prompts.ts         # 9 guided workflow prompts
├── resources.ts       # 4 reference resources
├── output-schemas.ts  # Zod output validation schemas
├── tools/             # 105 tool implementations (one file per tool)
├── code-mode/         # Code Mode: sandbox, type generator, search, execute
├── utils/             # Validation, cursors, errors, TypeID
└── cli/               # API key generation CLI
```

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
  <p><sub>Built by <a href="https://cynco.io">Cynco</a> — AI-native accounting for every business</sub></p>
</div>
