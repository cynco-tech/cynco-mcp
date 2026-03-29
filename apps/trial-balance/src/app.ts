/**
 * Trial Balance Viewer MCP App
 * Indented account hierarchy with debit/credit columns.
 * Calls: get_trial_balance
 */
import "../../shared/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { fmtCurrency, fmtPeriod, currentPeriod, parseToolResult, loadingHtml, errorHtml } from "../../shared/format";

const root = document.getElementById("root")!;
const app = new App({ name: "Cynco Trial Balance", version: "1.0.0" });

let period = currentPeriod();

interface TBData {
  data?: {
    period?: string;
    accounts?: { code: string; name: string; type: string; debit: number; credit: number; level?: number }[];
    totals?: { debit: number; credit: number };
    isBalanced?: boolean;
  };
}

const TYPE_ORDER: Record<string, number> = { asset: 0, liability: 1, equity: 2, revenue: 3, expense: 4, cost_of_sales: 5 };
const TYPE_LABELS: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", revenue: "Revenue", expense: "Expenses", cost_of_sales: "Cost of Sales" };

function render(data: TBData | null) {
  const d = data?.data;
  const accounts = d?.accounts ?? [];
  const totals = d?.totals ?? { debit: 0, credit: 0 };
  const balanced = d?.isBalanced ?? (Math.abs(totals.debit - totals.credit) < 0.01);

  // Group by type
  const grouped = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const key = a.type || "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99));

  root.innerHTML = `
    <div class="card-header">
      <div>
        <div class="card-title">Trial Balance</div>
        <div class="card-subtitle">Period: ${fmtPeriod(d?.period ?? period)}</div>
      </div>
      <div style="display:flex;gap:var(--space-2);align-items:center">
        <input type="month" value="${period}" id="period-input" style="padding:var(--space-2);border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:var(--text-sm);background:var(--color-bg-card);color:var(--color-text)">
        <span class="badge ${balanced ? "badge-success" : "badge-danger"}">${balanced ? "Balanced" : "UNBALANCED"}</span>
      </div>
    </div>

    <div class="card" style="padding:0;overflow:auto">
      <table>
        <thead>
          <tr><th>Code</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr>
        </thead>
        <tbody>
          ${sortedGroups.map(([type, accts]) => `
            <tr style="background:var(--color-bg-subtle)">
              <td colspan="4" style="font-weight:600;font-size:var(--text-xs);text-transform:uppercase;letter-spacing:0.05em;color:var(--color-text-secondary);padding:var(--space-2) var(--space-3)">
                ${TYPE_LABELS[type] ?? type}
              </td>
            </tr>
            ${accts.filter((a) => a.debit !== 0 || a.credit !== 0).map((a) => `
              <tr>
                <td style="font-family:var(--font-mono);font-size:var(--text-xs);color:var(--color-text-muted)">${a.code}</td>
                <td style="padding-left:${((a.level ?? 1) - 1) * 16 + 12}px">${a.name}</td>
                <td class="num">${a.debit > 0 ? fmtCurrency(a.debit) : ""}</td>
                <td class="num">${a.credit > 0 ? fmtCurrency(a.credit) : ""}</td>
              </tr>
            `).join("")}
          `).join("")}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>Total</strong></td>
            <td class="num"><strong>${fmtCurrency(totals.debit)}</strong></td>
            <td class="num"><strong>${fmtCurrency(totals.credit)}</strong></td>
          </tr>
          ${!balanced ? `
          <tr>
            <td colspan="2" style="color:var(--color-danger);font-weight:600">Difference</td>
            <td class="num" colspan="2" style="color:var(--color-danger);font-weight:600">${fmtCurrency(Math.abs(totals.debit - totals.credit))}</td>
          </tr>` : ""}
        </tfoot>
      </table>
    </div>
  `;

  document.getElementById("period-input")?.addEventListener("change", (e) => {
    period = (e.target as HTMLInputElement).value;
    loadData();
  });
}

async function loadData() {
  root.innerHTML = loadingHtml("Loading trial balance...");
  try {
    const res = await app.callServerTool({ name: "get_trial_balance", arguments: { period } });
    render(parseToolResult<TBData>(res));
  } catch (err) {
    root.innerHTML = errorHtml(`Failed to load trial balance: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.connect();

let loaded = false;
app.ontoolresult = (result) => {
  loaded = true;
  const seed = parseToolResult<{ period?: string }>(result);
  if (seed?.period) period = seed.period;
  loadData();
};
setTimeout(() => { if (!loaded) loadData(); }, 500);
