/**
 * AR/AP Aging Report MCP App
 * Shows aging buckets as stacked bars + detail table with drill-down.
 * Calls: get_customer_aging, get_vendor_aging, get_customer_statement, get_vendor_statement
 */
import "../../shared/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { fmtCurrency, fmtCompact, esc, donutSvg, parseToolResult, loadingHtml, errorHtml } from "../../shared/format";

const root = document.getElementById("root")!;
const app = new App({ name: "Cynco Aging Report", version: "1.0.0" });

type View = "ar" | "ap";
let currentView: View = "ar";

interface AgingData {
  data?: {
    summary?: { current: number; days30: number; days60: number; days90: number; over90: number; total: number };
    customers?: { id: string; name: string; current: number; days30: number; days60: number; days90: number; over90: number; total: number }[];
    vendors?: { id: string; name: string; current: number; days30: number; days60: number; days90: number; over90: number; total: number }[];
  };
}

const BUCKET_COLORS = ["var(--color-success)", "#60a5fa", "var(--color-warning)", "#f97316", "var(--color-danger)"];
const BUCKET_LABELS = ["Current", "1-30", "31-60", "61-90", "90+"];

function render(data: AgingData | null) {
  const d = data?.data;
  const s = d?.summary;
  const entities = currentView === "ar" ? (d?.customers ?? []) : (d?.vendors ?? []);
  const label = currentView === "ar" ? "Customer" : "Vendor";

  const buckets = s ? [s.current, s.days30, s.days60, s.days90, s.over90] : [0, 0, 0, 0, 0];
  const segments = BUCKET_LABELS.map((l, i) => ({ value: buckets[i], color: BUCKET_COLORS[i], label: l }));

  root.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">${currentView === "ar" ? "Accounts Receivable" : "Accounts Payable"} Aging</div>
        <div class="card-subtitle">Outstanding: ${fmtCurrency(s?.total ?? 0)}</div>
      </div>
      <div class="btn-group">
        <button class="btn btn-sm ${currentView === "ar" ? "active" : ""}" data-view="ar">AR</button>
        <button class="btn btn-sm ${currentView === "ap" ? "active" : ""}" data-view="ap">AP</button>
      </div>
    </div>

    ${s && s.total > 0 ? `
    <div class="section">
      <div class="card">
        <div class="donut-container">
          ${donutSvg(segments, 140, 24)}
          <div class="donut-legend">
            ${segments.map((seg, i) => `
              <div class="legend-item">
                <span class="legend-dot" style="background:${seg.color}"></span>
                <span>${seg.label} days</span>
                <strong style="margin-left:auto;font-variant-numeric:tabular-nums">${fmtCurrency(seg.value)}</strong>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card" style="padding:0;overflow:auto">
        <table>
          <thead>
            <tr>
              <th>${label}</th>
              ${BUCKET_LABELS.map((l) => `<th class="num">${l}</th>`).join("")}
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            ${entities.map((e) => `
              <tr style="cursor:pointer" data-entity-id="${esc(e.id)}" data-entity-name="${esc(e.name)}">
                <td><strong>${esc(e.name)}</strong></td>
                <td class="num">${fmtCurrency(e.current)}</td>
                <td class="num">${fmtCurrency(e.days30)}</td>
                <td class="num">${fmtCurrency(e.days60)}</td>
                <td class="num">${fmtCurrency(e.days90)}</td>
                <td class="num" ${e.over90 > 0 ? 'style="color:var(--color-danger);font-weight:600"' : ""}>${fmtCurrency(e.over90)}</td>
                <td class="num"><strong>${fmtCurrency(e.total)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              ${buckets.map((b) => `<td class="num">${fmtCurrency(b)}</td>`).join("")}
              <td class="num"><strong>${fmtCurrency(s.total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    ` : `<div class="empty">No outstanding ${currentView === "ar" ? "receivables" : "payables"}. All clear.</div>`}
  `;

  // View toggle
  root.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentView = (btn as HTMLElement).dataset.view as View;
      loadData();
    });
  });

  // Row drill-down
  root.querySelectorAll("[data-entity-id]").forEach((row) => {
    row.addEventListener("click", async () => {
      const id = (row as HTMLElement).dataset.entityId!;
      const toolName = currentView === "ar" ? "get_customer_statement" : "get_vendor_statement";
      const argKey = currentView === "ar" ? "customerId" : "vendorId";
      try {
        await app.callServerTool({ name: toolName, arguments: { [argKey]: id } });
      } catch { /* host will display the result */ }
    });
  });
}

async function loadData() {
  root.innerHTML = loadingHtml(`Loading ${currentView === "ar" ? "AR" : "AP"} aging...`);
  try {
    const toolName = currentView === "ar" ? "get_customer_aging" : "get_vendor_aging";
    const res = await app.callServerTool({ name: toolName, arguments: {} });
    render(parseToolResult<AgingData>(res));
  } catch (err) {
    root.innerHTML = errorHtml(`Failed to load aging: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.connect();

let loaded = false;
app.ontoolresult = (result) => {
  loaded = true;
  const seed = parseToolResult<{ type?: View }>(result);
  if (seed?.type) currentView = seed.type;
  loadData();
};
setTimeout(() => { if (!loaded) loadData(); }, 500);
