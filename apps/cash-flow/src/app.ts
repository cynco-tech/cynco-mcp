/**
 * Cash Flow Chart MCP App
 * Monthly inflows/outflows bar chart with net line and running totals.
 * Calls: get_cash_flow_summary
 */
import "../../shared/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { fmtCurrency, fmtCompact, fmtPeriod, parseToolResult, loadingHtml, errorHtml } from "../../shared/format";

const root = document.getElementById("root")!;
const app = new App({ name: "Cynco Cash Flow", version: "1.0.0" });

let monthRange = 6;

interface CashFlowData {
  data?: {
    months?: { period: string; inflows: number; outflows: number; net: number }[];
    totals?: { inflows: number; outflows: number; net: number };
    topCategories?: { category: string; total: number }[];
  };
}

function render(data: CashFlowData | null) {
  const months = data?.data?.months ?? [];
  const totals = data?.data?.totals ?? { inflows: 0, outflows: 0, net: 0 };
  const topCats = data?.data?.topCategories ?? [];
  const maxVal = Math.max(1, ...months.map((m) => Math.max(m.inflows, Math.abs(m.outflows))));

  // Running balance
  let running = 0;
  const withRunning = months.map((m) => { running += m.net; return { ...m, running }; });

  root.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">Cash Flow Analysis</div>
        <div class="card-subtitle">Net: ${fmtCurrency(totals.net)}</div>
      </div>
      <div class="btn-group">
        ${[3, 6, 12].map((n) => `<button class="btn btn-sm ${monthRange === n ? "active" : ""}" data-months="${n}">${n}M</button>`).join("")}
      </div>
    </div>

    <div class="section">
      <div class="grid grid-3">
        <div class="kpi">
          <div class="kpi-label">Total Inflows</div>
          <div class="kpi-value" style="color:var(--color-success)">${fmtCompact(totals.inflows)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Total Outflows</div>
          <div class="kpi-value" style="color:var(--color-danger)">${fmtCompact(Math.abs(totals.outflows))}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Net Cash Flow</div>
          <div class="kpi-value" style="color:${totals.net >= 0 ? "var(--color-success)" : "var(--color-danger)"}">${fmtCompact(totals.net)}</div>
        </div>
      </div>
    </div>

    ${months.length > 0 ? `
    <div class="section">
      <div class="card">
        <div class="section-title">Monthly Breakdown</div>
        <div class="bar-chart" style="height:200px">
          ${withRunning.map((m) => `
            <div class="bar-group">
              <div class="bar-value">${fmtCompact(m.net)}</div>
              <div style="display:flex;gap:2px;align-items:flex-end;height:100%;width:100%">
                <div class="bar" style="height:${(m.inflows / maxVal) * 100}%;background:var(--color-success);flex:1" title="In: ${fmtCurrency(m.inflows)}"></div>
                <div class="bar" style="height:${(Math.abs(m.outflows) / maxVal) * 100}%;background:var(--color-danger);opacity:0.7;flex:1" title="Out: ${fmtCurrency(m.outflows)}"></div>
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
    </div>

    <div class="section">
      <div class="card" style="padding:0;overflow:auto">
        <table>
          <thead><tr><th>Month</th><th class="num">Inflows</th><th class="num">Outflows</th><th class="num">Net</th><th class="num">Running</th></tr></thead>
          <tbody>
            ${withRunning.map((m) => `
              <tr>
                <td>${fmtPeriod(m.period)}</td>
                <td class="num" style="color:var(--color-success)">${fmtCurrency(m.inflows)}</td>
                <td class="num" style="color:var(--color-danger)">${fmtCurrency(m.outflows)}</td>
                <td class="num" style="color:${m.net >= 0 ? "var(--color-success)" : "var(--color-danger)"}"><strong>${fmtCurrency(m.net)}</strong></td>
                <td class="num">${fmtCurrency(m.running)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td class="num" style="color:var(--color-success)">${fmtCurrency(totals.inflows)}</td>
              <td class="num" style="color:var(--color-danger)">${fmtCurrency(totals.outflows)}</td>
              <td class="num"><strong>${fmtCurrency(totals.net)}</strong></td>
              <td class="num">${fmtCurrency(running)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    ` : `<div class="empty">No cash flow data available for this period.</div>`}

    ${topCats.length > 0 ? `
    <div class="section">
      <div class="card">
        <div class="section-title">Top Spending Categories</div>
        ${topCats.slice(0, 5).map((c) => {
          const pct = totals.outflows !== 0 ? Math.abs(c.total / totals.outflows) * 100 : 0;
          return `<div style="margin-bottom:var(--space-2)">
            <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);margin-bottom:2px">
              <span>${c.category}</span>
              <span style="font-variant-numeric:tabular-nums">${fmtCurrency(Math.abs(c.total))}</span>
            </div>
            <div style="background:var(--color-bg-muted);border-radius:var(--radius-sm);height:6px;overflow:hidden">
              <div style="background:var(--color-danger);opacity:0.7;height:100%;width:${pct}%;border-radius:var(--radius-sm)"></div>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>` : ""}
  `;

  // Month range toggle
  root.querySelectorAll("[data-months]").forEach((btn) => {
    btn.addEventListener("click", () => {
      monthRange = parseInt((btn as HTMLElement).dataset.months!, 10);
      loadData();
    });
  });
}

async function loadData() {
  root.innerHTML = loadingHtml("Loading cash flow...");
  try {
    const res = await app.callServerTool({ name: "get_cash_flow_summary", arguments: { months: monthRange } });
    render(parseToolResult<CashFlowData>(res));
  } catch (err) {
    root.innerHTML = errorHtml(`Failed to load cash flow: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.connect();

let loaded = false;
app.ontoolresult = (result) => {
  loaded = true;
  const seed = parseToolResult<{ months?: number }>(result);
  if (seed?.months) monthRange = seed.months;
  loadData();
};
setTimeout(() => { if (!loaded) loadData(); }, 500);
