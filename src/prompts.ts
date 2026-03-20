import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt("month_end_close", {
    title: "Month-End Close",
    description: "Guided workflow for closing an accounting period. Walks through checking drafts, reconciliation, trial balance, and final close.",
    argsSchema: {
      period: z.string().regex(/^\d{4}-\d{2}$/).describe("Period to close (YYYY-MM)"),
    },
  }, async ({ period }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `Help me close the accounting period ${period}. Follow these steps in order:`,
          "",
          "1. Check period status — call get_period_status to see if this period is open",
          `2. Find draft journal entries — call get_journal_entries with status='draft' and period='${period}'`,
          "   - If any drafts exist, list them and ask whether to post or void each one",
          `3. Check reconciliation — call get_reconciliation_status for period '${period}'`,
          "   - Report any unreconciled entries and ask how to proceed",
          `4. Generate trial balance — call get_trial_balance with period='${period}'`,
          "   - Verify debits equal credits",
          "   - Flag any unusual balances",
          `5. Generate financial statements — call get_income_statement and get_balance_sheet for period '${period}'`,
          "   - Present a summary of revenue, expenses, net income, and balance sheet totals",
          `6. If everything looks good, call close_period with period='${period}'`,
          "",
          "At each step, pause and report findings before proceeding to the next.",
        ].join("\n"),
      },
    }],
  }));

  server.registerPrompt("categorize_transactions", {
    title: "Categorize Bank Transactions",
    description: "Review and categorize uncategorized bank transactions using the chart of accounts.",
    argsSchema: {
      financialAccountId: z.string().optional().describe("Filter to a specific bank account"),
    },
  }, async ({ financialAccountId }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Help me categorize uncategorized bank transactions. Follow these steps:",
          "",
          "1. Get the chart of accounts — call get_chart_of_accounts with compact=true",
          `2. List uncategorized transactions — call get_bank_transactions with status='imported'${financialAccountId ? ` and financialAccountId='${financialAccountId}'` : ""}`,
          "3. Get existing categorization rules — call get_categorization_rules",
          "4. For each uncategorized transaction:",
          "   a. Analyze the description and amount",
          "   b. Suggest the best matching COA account using search_accounts",
          "   c. Present the suggestion with reasoning",
          "   d. If the user approves, call update_bank_transaction_status to set the category",
          "5. After categorizing, ask if the user wants to create categorization rules for recurring patterns",
          "   - If yes, call create_categorization_rule for each pattern",
          "6. Ask if the user wants to post the categorized transactions to the GL",
          "   - If yes, call post_bank_transactions",
          "",
          "Present transactions in batches of 10. Group similar transactions together.",
        ].join("\n"),
      },
    }],
  }));

  server.registerPrompt("financial_health_check", {
    title: "Financial Health Check",
    description: "Comprehensive review of the business's financial position with actionable insights.",
  }, async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Perform a comprehensive financial health check. Gather data and then present a clear report.",
          "",
          "Data gathering (call these tools):",
          "1. get_company_profile — understand the business",
          "2. get_financial_summary — overview of balances and activity",
          "3. get_balance_sheet — current assets, liabilities, equity",
          "4. get_income_statement — revenue and expenses",
          "5. get_cash_flow_summary — cash position and trends",
          "6. get_customer_aging — who owes money and how overdue",
          "7. get_vendor_aging — what the business owes",
          "",
          "Then present a report covering:",
          "- Liquidity: current ratio, quick ratio, cash runway",
          "- Profitability: gross margin, net margin, trend direction",
          "- Receivables: total outstanding, average days, overdue percentage",
          "- Payables: total outstanding, any critically overdue",
          "- Cash flow: monthly trend, burn rate if applicable",
          "- Red flags: any concerning patterns or anomalies",
          "- Recommendations: 3-5 specific actionable items",
          "",
          "Keep the report concise but thorough. Use tables for data.",
        ].join("\n"),
      },
    }],
  }));

  server.registerPrompt("reconcile_bank_account", {
    title: "Reconcile Bank Account",
    description: "Step-by-step bank account reconciliation workflow.",
    argsSchema: {
      financialAccountId: z.string().describe("The bank/financial account to reconcile"),
      period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Period to reconcile (YYYY-MM)"),
    },
  }, async ({ financialAccountId, period }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `Help me reconcile the bank account ${financialAccountId}${period ? ` for period ${period}` : ""}.`,
          "",
          "1. Get account details — call get_financial_accounts to find this account's linked COA account",
          `2. Get bank transactions — call get_bank_transactions with financialAccountId='${financialAccountId}'${period ? ` filtered to period '${period}'` : ""}`,
          "3. Get GL entries — call get_general_ledger for the linked COA account",
          `4. Check reconciliation status — call get_reconciliation_status${period ? ` for period '${period}'` : ""}`,
          "",
          "5. Compare and match:",
          "   - Match bank transactions to GL entries by amount and date",
          "   - Report any unmatched transactions on either side",
          "   - For matched pairs, call reconcile_accounts to mark GL entries as reconciled",
          "",
          "6. Summary:",
          "   - Bank statement ending balance",
          "   - GL ending balance",
          "   - Reconciling items (outstanding deposits, unpresented checks)",
          "   - Adjusted balance (should match)",
        ].join("\n"),
      },
    }],
  }));

  // ── Code Mode ────────────────────────────────────────────────

  server.registerPrompt("code_mode_intro", {
    title: "Code Mode Introduction",
    description: "Learn how to use Code Mode — call multiple tools in a single script for ~90% token savings.",
  }, async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Explain how to use Code Mode for efficient multi-step workflows.",
          "",
          "Code Mode lets you call multiple tools in a single round-trip using JavaScript:",
          "",
          "1. **Discover tools:** Call search_tools with a query to find relevant tools and get TypeScript signatures",
          "2. **Write a script:** Use `await cynco.<tool_name>(args)` to call tools and `console.log()` for output",
          "3. **Execute:** Call execute_code with your script — all tool calls run in one round-trip",
          "",
          "Example workflow — financial health check in one script:",
          "```javascript",
          "const profile = await cynco.get_company_profile({});",
          "const summary = await cynco.get_financial_summary({});",
          "const bs = await cynco.get_balance_sheet({});",
          "const is = await cynco.get_income_statement({});",
          "const arAging = await cynco.get_customer_aging({});",
          "const apAging = await cynco.get_vendor_aging({});",
          "console.log({ profile: profile.data, summary: summary.data,",
          "  balanceSheet: bs.data, incomeStatement: is.data,",
          "  arAging: arAging.data, apAging: apAging.data });",
          "```",
          "",
          "This replaces 6 individual tool calls with 1, saving ~90% in token overhead.",
          "",
          "Limits: 60s timeout, 50 tool calls, 10KB script, 50KB output.",
          "Security: Scripts run in a sandbox — no process, require, import, or fetch.",
          "Auth: Each cynco.* call goes through the same scope checks as direct tool calls.",
        ].join("\n"),
      },
    }],
  }));

  // ── Phase 5 prompts ─────────────────────────────────────────

  server.registerPrompt("create_agreement", {
    title: "Create Agreement",
    description: "Guided agreement creation — walks through template selection, counterparty details, terms, and signers.",
    argsSchema: {
      counterpartyName: z.string().describe("Name of the other party"),
      agreementType: z.enum(["contract", "proposal", "engagement_letter", "nda", "msa", "sow"]).optional().describe("Type of agreement"),
    },
  }, async ({ counterpartyName, agreementType }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `Help me create an agreement with ${counterpartyName}${agreementType ? ` (type: ${agreementType})` : ""}.`,
          "",
          "1. Call get_contract_templates to show available templates" + (agreementType ? ` filtered to type '${agreementType}'` : ""),
          "2. Ask which template to use (or start from scratch)",
          "3. Call get_clauses to show the clause library",
          "4. Ask about key terms: effective date, expiration, auto-renewal",
          "5. Check if the counterparty is an existing customer or vendor:",
          "   - Call get_customers and get_vendors to search",
          "6. Call create_agreement with all gathered details",
          "7. Ask if a billing schedule should be created",
          "   - If yes, call create_billing_schedule with milestones",
          "",
          "Present each step clearly and confirm before proceeding.",
        ].join("\n"),
      },
    }],
  }));

  server.registerPrompt("asset_register_review", {
    title: "Asset Register Review",
    description: "Review fixed asset register, check depreciation, and identify issues.",
  }, async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Perform a comprehensive review of the fixed asset register.",
          "",
          "1. Call get_asset_summary for an overview by category and status",
          "2. Call get_asset_categories to understand the category structure",
          "3. Call get_fixed_assets to list all active assets",
          "4. For any fully depreciated assets still marked active, flag them",
          "5. Call get_depreciation_schedule for the current period",
          "6. Check for:",
          "   - Assets without depreciation schedules",
          "   - Unusual residual values (> 50% of cost)",
          "   - Overdue disposals (assets held_for_sale for > 6 months)",
          "7. Present a summary report with recommendations",
        ].join("\n"),
      },
    }],
  }));

  server.registerPrompt("vendor_payment_run", {
    title: "Vendor Payment Run",
    description: "Review AP, prioritize vendor payments, and record a batch.",
  }, async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Help me plan and execute a vendor payment run.",
          "",
          "1. Call get_vendor_aging for the AP aging overview",
          "2. Call get_bills with status 'awaiting_payment' or 'overdue'",
          "3. Prioritize payments:",
          "   a. Critically overdue (90+ days) — must pay",
          "   b. Overdue (30-90 days) — should pay",
          "   c. Due this week — plan to pay",
          "   d. Future due — defer",
          "4. Present a payment plan table with vendor, amount, priority, and reason",
          "5. After approval, for each payment:",
          "   - Call record_payment for the vendor",
          "   - Call update_bill_status to mark as paid",
          "6. Present a summary of all payments made",
        ].join("\n"),
      },
    }],
  }));

  server.registerPrompt("data_room_organize", {
    title: "Organize Data Room",
    description: "Review data room contents and suggest organization improvements.",
  }, async () => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          "Help me organize and review the data room.",
          "",
          "1. Call get_dataroom_folders to see the current structure",
          "2. Call get_dataroom_files (no folder filter) to see all files",
          "3. Identify issues:",
          "   - Files in the root without a folder",
          "   - Folders with no files (empty folders)",
          "   - Duplicate file names across folders",
          "   - Files without descriptions",
          "4. Suggest a folder structure based on the files found",
          "   - Typical structure: Financial Statements, Tax, Contracts, Invoices, Bank Statements, Corporate",
          "5. If the user approves the new structure:",
          "   - Call create_dataroom_folder for each new folder",
          "6. Call get_dataroom_activity to check recent changes",
          "7. Present a summary of the data room health",
        ].join("\n"),
      },
    }],
  }));
}
