/**
 * Financial Dashboard MCP App
 * Shows KPI tiles, cash flow bar chart, AR/AP aging donut, and action items.
 * Calls: get_financial_summary, get_cash_flow_summary, get_customer_aging, get_vendor_aging
 */
import "../../shared/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { fmtCompact, fmtCurrency, fmtPeriod, donutSvg, parseToolResult, loadingHtml, errorHtml } from "../../shared/format";

const root = document.getElementById("root")!;
const app = new App({ name: "Cynco Dashboard", version: "1.0.0" });

// ── State ────────────────────────────────────────────────────────────────────
interface Summary {
  data?: {
    accountBalances?: { type: string; totalDebit: number; totalCredit: number; balance: number }[];
    journalEntryCounts?: { total: number; draft: number; posted: number; approved: number };
    transactionCounts?: { total: number; imported: number; categorized: number; posted: number };
    arOutstanding?: number;
    apOutstanding?: number;
  };
}
interface CashFlow {
  data?: {
    months?: { period: string; inflows: number; outflows: number; net: number }[];
    totals?: { inflows: number; outflows: number; net: number };
  };
}
interface Aging {
  data?: {
    summary?: { current: number; days30: number; days60: number; days90: number; over90: number; total: number };
    customers?: { name: string; total: number }[];
    vendors?: { name: string; total: number }[];
  };
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(summary: Summary | null, cashFlow: CashFlow | null, arAging: Aging | null, apAging: Aging | null) {
  const s = summary?.data;
  const cf = cashFlow?.data;

  // Revenue = type "revenue" balance, Expenses = type "expense" balance
  const revenue = Math.abs(s?.accountBalances?.find((a) => a.type === "revenue")?.balance ?? 0);
  const expenses = Math.abs(s?.accountBalances?.find((a) => a.type === "expense")?.balance ?? 0);
  const netIncome = revenue - expenses;
  const arTotal = s?.arOutstanding ?? arAging?.data?.summary?.total ?? 0;
  const apTotal = s?.apOutstanding ?? apAging?.data?.summary?.total ?? 0;
  const draftJEs = s?.journalEntryCounts?.draft ?? 0;
  const uncategorized = s?.transactionCounts?.imported ?? 0;

  // Cash flow bar chart
  const months = cf?.months ?? [];
  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.inflows, Math.abs(m.outflows))));

  // AR donut
  const arSeg = arAging?.data?.summary;
  const arSegments = arSeg ? [
    { value: arSeg.current, color: "var(--color-success)", label: "Current" },
    { value: arSeg.days30, color: "#60a5fa", label: "1-30 days" },
    { value: arSeg.days60, color: "var(--color-warning)", label: "31-60 days" },
    { value: arSeg.days90, color: "#f97316", label: "61-90 days" },
    { value: arSeg.over90, color: "var(--color-danger)", label: "90+ days" },
  ] : [];

  root.innerHTML = `
    <div class="card-header" style="margin-bottom: var(--space-5)">
      <div>
        <div class="card-title" style="font-size: var(--text-2xl)">Financial Dashboard</div>
        <div class="card-subtitle">As of ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
      <button class="btn btn-sm" id="refresh-btn">Refresh</button>
    </div>

    <div class="section">
      <div class="grid grid-3">
        <div class="kpi">
          <div class="kpi-label">Revenue</div>
          <div class="kpi-value" style="color: var(--color-success)">${fmtCompact(revenue)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Expenses</div>
          <div class="kpi-value" style="color: var(--color-danger)">${fmtCompact(expenses)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-value" style="color: ${netIncome >= 0 ? "var(--color-success)" : "var(--color-danger)"}">${fmtCompact(netIncome)}</div>
          <div class="kpi-label">Net Income</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="grid grid-3">
        <div class="kpi">
          <div class="kpi-label">AR Outstanding</div>
          <div class="kpi-value">${fmtCompact(arTotal)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">AP Outstanding</div>
          <div class="kpi-value">${fmtCompact(apTotal)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Working Capital</div>
          <div class="kpi-value" style="color: ${arTotal - apTotal >= 0 ? "var(--color-success)" : "var(--color-danger)"}">${fmtCompact(arTotal - apTotal)}</div>
        </div>
      </div>
    </div>

    ${months.length > 0 ? `
    <div class="section">
      <div class="card">
        <div class="section-title">Cash Flow — Last ${months.length} Months</div>
        <div class="bar-chart">
          ${months.map((m) => `
            <div class="bar-group">
              <div class="bar-value">${fmtCompact(m.net)}</div>
              <div style="display:flex;gap:2px;align-items:flex-end;height:100%;width:100%">
                <div class="bar" style="height:${(m.inflows / maxVal) * 100}%;background:var(--color-success);flex:1"></div>
                <div class="bar" style="height:${(Math.abs(m.outflows) / maxVal) * 100}%;background:var(--color-danger);opacity:0.7;flex:1"></div>
              </div>
              <div class="bar-label">${fmtPeriod(m.period)}</div>
            </div>
          `).join("")}
        </div>
        <div style="display:flex;gap:var(--space-4);margin-top:var(--space-3);font-size:var(--text-xs);color:var(--color-text-muted)">
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--color-success);border-radius:2px"></span> Inflows</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:var(--color-danger);opacity:0.7;border-radius:2px"></span> Outflows</span>
        </div>
      </div>
    </div>` : ""}

    ${arSegments.length > 0 ? `
    <div class="section">
      <div class="card">
        <div class="section-title">Accounts Receivable Aging</div>
        <div class="donut-container">
          ${donutSvg(arSegments, 120, 20)}
          <div class="donut-legend">
            ${arSegments.filter((s) => s.value > 0).map((s) => `
              <div class="legend-item">
                <span class="legend-dot" style="background:${s.color}"></span>
                <span>${s.label}</span>
                <strong style="margin-left:auto">${fmtCurrency(s.value)}</strong>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>` : ""}

    <div class="section">
      <div class="grid grid-2">
        <div class="kpi">
          <div class="kpi-label">Draft Journal Entries</div>
          <div class="kpi-value">${draftJEs}</div>
          ${draftJEs > 0 ? `<div class="kpi-change negative">Needs review</div>` : `<div class="kpi-change positive">All clear</div>`}
        </div>
        <div class="kpi">
          <div class="kpi-label">Uncategorized Transactions</div>
          <div class="kpi-value">${uncategorized}</div>
          ${uncategorized > 0 ? `<div class="kpi-change negative">Pending categorization</div>` : `<div class="kpi-change positive">All categorized</div>`}
        </div>
      </div>
    </div>
  `;

  document.getElementById("refresh-btn")?.addEventListener("click", loadData);
}

// ── Data Loading ─────────────────────────────────────────────────────────────
async function loadData() {
  root.innerHTML = loadingHtml("Loading financial data...");

  try {
    const [summaryRes, cashFlowRes, arRes, apRes] = await Promise.all([
      app.callServerTool({ name: "get_financial_summary", arguments: {} }),
      app.callServerTool({ name: "get_cash_flow_summary", arguments: { months: 6 } }),
      app.callServerTool({ name: "get_customer_aging", arguments: {} }).catch(() => null),
      app.callServerTool({ name: "get_vendor_aging", arguments: {} }).catch(() => null),
    ]);

    render(
      parseToolResult<Summary>(summaryRes),
      parseToolResult<CashFlow>(cashFlowRes),
      arRes ? parseToolResult<Aging>(arRes) : null,
      apRes ? parseToolResult<Aging>(apRes) : null,
    );
  } catch (err) {
    root.innerHTML = errorHtml(`Failed to load dashboard: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
app.connect();

let loaded = false;
app.ontoolresult = () => { loaded = true; loadData(); };
// Fallback if host doesn't push an initial tool result
setTimeout(() => { if (!loaded) loadData(); }, 500);
