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
}
