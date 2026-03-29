/**
 * Financial Statements MCP App (Income Statement / Balance Sheet)
 * Formatted financial reports matching accounting conventions.
 * Calls: get_income_statement, get_balance_sheet
 */
import "../../shared/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { fmtCurrency, fmtPeriod, currentPeriod, parseToolResult, loadingHtml, errorHtml } from "../../shared/format";

const root = document.getElementById("root")!;
const app = new App({ name: "Cynco Financial Statements", version: "1.0.0" });

type View = "income" | "balance";
let view: View = "income";
let period = currentPeriod();

interface Section { name: string; accounts: { code: string; name: string; amount: number }[]; total: number; }
interface IncomeData { data?: { period?: string; revenue?: Section; costOfSales?: Section; operatingExpenses?: Section; otherIncome?: Section; otherExpenses?: Section; grossProfit?: number; operatingProfit?: number; netIncome?: number; }; }
interface BalanceData { data?: { period?: string; assets?: { current?: Section; nonCurrent?: Section; total?: number }; liabilities?: { current?: Section; nonCurrent?: Section; total?: number }; equity?: Section; totalLiabilitiesAndEquity?: number; isBalanced?: boolean; }; }

function renderSection(section: Section | undefined, indent = 0): string {
  if (!section?.accounts?.length) return "";
  return section.accounts
    .filter((a) => a.amount !== 0)
    .map((a) => `
      <tr>
        <td style="padding-left:${indent + 24}px">${a.name}</td>
        <td class="num">${fmtCurrency(a.amount)}</td>
      </tr>
    `).join("");
}

function renderSectionWithTotal(label: string, section: Section | undefined, indent = 0): string {
  if (!section) return "";
  return `
    ${renderSection(section, indent)}
    <tr style="border-top:1px solid var(--color-border)">
      <td style="padding-left:${indent}px;font-weight:600">${label}</td>
      <td class="num" style="font-weight:600">${fmtCurrency(section.total)}</td>
    </tr>
  `;
}

function renderIncome(data: IncomeData | null) {
  const d = data?.data;
  const gross = d?.grossProfit ?? 0;
  const operating = d?.operatingProfit ?? 0;
  const net = d?.netIncome ?? 0;

  return `
    <div class="card" style="padding:0;overflow:auto">
      <table>
        <thead><tr><th colspan="2" style="font-size:var(--text-lg);padding:var(--space-4)">Income Statement — ${fmtPeriod(d?.period ?? period)}</th></tr></thead>
        <tbody>
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-2) var(--space-3)">Revenue</td></tr>
          ${renderSection(d?.revenue, 0)}
          <tr style="border-top:1px solid var(--color-border)"><td style="font-weight:600">Total Revenue</td><td class="num" style="font-weight:600">${fmtCurrency(d?.revenue?.total ?? 0)}</td></tr>

          ${d?.costOfSales?.accounts?.length ? `
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-2) var(--space-3)">Cost of Sales</td></tr>
          ${renderSection(d.costOfSales, 0)}
          <tr style="border-top:1px solid var(--color-border)"><td style="font-weight:600">Total Cost of Sales</td><td class="num" style="font-weight:600">${fmtCurrency(d.costOfSales.total)}</td></tr>
          <tr style="background:var(--color-bg-muted)"><td style="font-weight:700">Gross Profit</td><td class="num" style="font-weight:700;color:${gross >= 0 ? "var(--color-success)" : "var(--color-danger)"}">${fmtCurrency(gross)}</td></tr>
          ` : ""}

          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-2) var(--space-3)">Operating Expenses</td></tr>
          ${renderSection(d?.operatingExpenses, 0)}
          <tr style="border-top:1px solid var(--color-border)"><td style="font-weight:600">Total Operating Expenses</td><td class="num" style="font-weight:600">${fmtCurrency(d?.operatingExpenses?.total ?? 0)}</td></tr>
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--color-text)">
            <td style="font-weight:700;font-size:var(--text-lg)">Net Income</td>
            <td class="num" style="font-weight:700;font-size:var(--text-lg);color:${net >= 0 ? "var(--color-success)" : "var(--color-danger)"}">${fmtCurrency(net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderBalance(data: BalanceData | null) {
  const d = data?.data;
  const balanced = d?.isBalanced ?? true;

  return `
    <div class="card" style="padding:0;overflow:auto">
      <table>
        <thead><tr>
          <th style="font-size:var(--text-lg);padding:var(--space-4)">Balance Sheet — ${fmtPeriod(d?.period ?? period)}</th>
          <th class="num" style="padding:var(--space-4)"><span class="badge ${balanced ? "badge-success" : "badge-danger"}">${balanced ? "A = L + E" : "UNBALANCED"}</span></th>
        </tr></thead>
        <tbody>
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:700;padding:var(--space-2) var(--space-3)">Assets</td></tr>
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-1) var(--space-3);font-size:var(--text-xs);text-transform:uppercase;color:var(--color-text-secondary)">Current Assets</td></tr>
          ${renderSectionWithTotal("Total Current Assets", d?.assets?.current, 12)}
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-1) var(--space-3);font-size:var(--text-xs);text-transform:uppercase;color:var(--color-text-secondary)">Non-Current Assets</td></tr>
          ${renderSectionWithTotal("Total Non-Current Assets", d?.assets?.nonCurrent, 12)}
          <tr style="background:var(--color-bg-muted)"><td style="font-weight:700">Total Assets</td><td class="num" style="font-weight:700">${fmtCurrency(d?.assets?.total ?? 0)}</td></tr>

          <tr><td colspan="2" style="height:var(--space-4)"></td></tr>

          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:700;padding:var(--space-2) var(--space-3)">Liabilities</td></tr>
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-1) var(--space-3);font-size:var(--text-xs);text-transform:uppercase;color:var(--color-text-secondary)">Current Liabilities</td></tr>
          ${renderSectionWithTotal("Total Current Liabilities", d?.liabilities?.current, 12)}
          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:600;padding:var(--space-1) var(--space-3);font-size:var(--text-xs);text-transform:uppercase;color:var(--color-text-secondary)">Non-Current Liabilities</td></tr>
          ${renderSectionWithTotal("Total Non-Current Liabilities", d?.liabilities?.nonCurrent, 12)}
          <tr style="background:var(--color-bg-muted)"><td style="font-weight:700">Total Liabilities</td><td class="num" style="font-weight:700">${fmtCurrency(d?.liabilities?.total ?? 0)}</td></tr>

          <tr><td colspan="2" style="height:var(--space-2)"></td></tr>

          <tr style="background:var(--color-bg-subtle)"><td colspan="2" style="font-weight:700;padding:var(--space-2) var(--space-3)">Equity</td></tr>
          ${renderSectionWithTotal("Total Equity", d?.equity, 0)}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid var(--color-text)">
            <td style="font-weight:700;font-size:var(--text-lg)">Total Liabilities & Equity</td>
            <td class="num" style="font-weight:700;font-size:var(--text-lg)">${fmtCurrency(d?.totalLiabilitiesAndEquity ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function render(incomeData: IncomeData | null, balanceData: BalanceData | null) {
  root.innerHTML = `
    <div class="card-header">
      <div class="card-title">Financial Statements</div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <input type="month" value="${period}" id="period-input" style="padding:var(--space-2);border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:var(--text-sm);background:var(--color-bg-card);color:var(--color-text)">
        <div class="btn-group">
          <button class="btn btn-sm ${view === "income" ? "active" : ""}" data-view="income">P&L</button>
          <button class="btn btn-sm ${view === "balance" ? "active" : ""}" data-view="balance">Balance Sheet</button>
        </div>
      </div>
    </div>
    <div class="section">
      ${view === "income" ? renderIncome(incomeData) : renderBalance(balanceData)}
    </div>
  `;

  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => { view = (btn as HTMLElement).dataset.view as View; loadData(); });
  });
  document.getElementById("period-input")?.addEventListener("change", (e) => {
    period = (e.target as HTMLInputElement).value;
    loadData();
  });
}

async function loadData() {
  root.innerHTML = loadingHtml("Loading financial statements...");
  try {
    const [incomeRes, balanceRes] = await Promise.all([
      app.callServerTool({ name: "get_income_statement", arguments: { period } }),
      app.callServerTool({ name: "get_balance_sheet", arguments: { period } }),
    ]);
    render(parseToolResult<IncomeData>(incomeRes), parseToolResult<BalanceData>(balanceRes));
  } catch (err) {
    root.innerHTML = errorHtml(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.connect();

let loaded = false;
app.ontoolresult = (result) => {
  loaded = true;
  const seed = parseToolResult<{ period?: string; view?: View }>(result);
  if (seed?.period) period = seed.period;
  if (seed?.view) view = seed.view;
  loadData();
};
setTimeout(() => { if (!loaded) loadData(); }, 500);
