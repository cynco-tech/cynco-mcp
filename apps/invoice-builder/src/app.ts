/**
 * Invoice Builder MCP App
 * Interactive form for creating invoices with customer picker and line items.
 * Calls: get_customers, get_items, create_invoice
 */
import "../../shared/styles.css";
import { App } from "@modelcontextprotocol/ext-apps";
import { fmtCurrency, esc, parseToolResult, loadingHtml, errorHtml } from "../../shared/format";

const root = document.getElementById("root")!;
const app = new App({ name: "Cynco Invoice Builder", version: "1.0.0" });

interface Customer { id: string; name: string; email?: string; }
interface Item { id: string; name: string; unitPrice: number; taxRate?: number; }
interface LineItem { description: string; quantity: number; unitPrice: number; taxRate: number; }

let customers: Customer[] = [];
let items: Item[] = [];
let selectedCustomerId = "";
let lines: LineItem[] = [{ description: "", quantity: 1, unitPrice: 0, taxRate: 0 }];
let dueInDays = 30;
let notes = "";
let submitting = false;
let successMessage = "";

function calcLine(l: LineItem) { return l.quantity * l.unitPrice; }
function calcTax(l: LineItem) { return calcLine(l) * (l.taxRate / 100); }
function totalSubtotal() { return lines.reduce((s, l) => s + calcLine(l), 0); }
function totalTax() { return lines.reduce((s, l) => s + calcTax(l), 0); }
function totalAmount() { return totalSubtotal() + totalTax(); }

function render() {
  root.innerHTML = `
    <div class="card-header">
      <div class="card-title">New Invoice</div>
      ${successMessage ? `<span class="badge badge-success">${successMessage}</span>` : ""}
    </div>

    <div class="section">
      <div class="card">
        <div class="grid grid-2">
          <div>
            <label style="font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);display:block;margin-bottom:var(--space-1)">CUSTOMER</label>
            <select id="customer-select" style="width:100%">
              <option value="">Select customer...</option>
              ${customers.map((c) => `<option value="${esc(c.id)}" ${c.id === selectedCustomerId ? "selected" : ""}>${esc(c.name)}${c.email ? ` (${esc(c.email)})` : ""}</option>`).join("")}
            </select>
          </div>
          <div>
            <label style="font-size:var(--text-xs);font-weight:600;color:var(--color-text-muted);display:block;margin-bottom:var(--space-1)">DUE IN</label>
            <select id="due-days" style="width:100%">
              ${[7, 14, 30, 45, 60, 90].map((d) => `<option value="${d}" ${d === dueInDays ? "selected" : ""}>${d} days</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card" style="padding:0;overflow:auto">
        <table>
          <thead>
            <tr>
              <th style="width:40%">Description</th>
              <th class="num" style="width:12%">Qty</th>
              <th class="num" style="width:18%">Unit Price</th>
              <th class="num" style="width:12%">Tax %</th>
              <th class="num" style="width:14%">Amount</th>
              <th style="width:4%"></th>
            </tr>
          </thead>
          <tbody>
            ${lines.map((l, i) => `
              <tr>
                <td>
                  <input type="text" value="${esc(l.description)}" data-idx="${i}" data-field="description" placeholder="Item description..." style="width:100%;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-2);font-size:var(--text-sm);background:var(--color-bg-card);color:var(--color-text)">
                </td>
                <td><input type="number" value="${l.quantity}" data-idx="${i}" data-field="quantity" min="1" style="width:100%;text-align:right;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-2);font-size:var(--text-sm);background:var(--color-bg-card);color:var(--color-text)"></td>
                <td><input type="number" value="${l.unitPrice}" data-idx="${i}" data-field="unitPrice" min="0" step="0.01" style="width:100%;text-align:right;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-2);font-size:var(--text-sm);background:var(--color-bg-card);color:var(--color-text)"></td>
                <td><input type="number" value="${l.taxRate}" data-idx="${i}" data-field="taxRate" min="0" step="0.5" style="width:100%;text-align:right;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-1) var(--space-2);font-size:var(--text-sm);background:var(--color-bg-card);color:var(--color-text)"></td>
                <td class="num" style="font-weight:600">${fmtCurrency(calcLine(l) + calcTax(l))}</td>
                <td>${lines.length > 1 ? `<button class="btn btn-sm" data-remove="${i}" style="color:var(--color-danger);border:none;padding:2px 6px">x</button>` : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div style="padding:var(--space-3)">
          <button class="btn btn-sm" id="add-line">+ Add Line</button>
          ${items.length > 0 ? `
            <select id="item-picker" style="margin-left:var(--space-2);font-size:var(--text-xs)">
              <option value="">Quick add from catalog...</option>
              ${items.map((it) => `<option value="${esc(it.id)}">${esc(it.name)} — ${fmtCurrency(it.unitPrice)}</option>`).join("")}
            </select>
          ` : ""}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card">
        <div style="display:flex;justify-content:flex-end">
          <div style="width:240px">
            <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);margin-bottom:var(--space-1)"><span>Subtotal</span><span style="font-variant-numeric:tabular-nums">${fmtCurrency(totalSubtotal())}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);margin-bottom:var(--space-2);color:var(--color-text-secondary)"><span>Tax</span><span style="font-variant-numeric:tabular-nums">${fmtCurrency(totalTax())}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:var(--text-xl);font-weight:700;padding-top:var(--space-2);border-top:2px solid var(--color-text)"><span>Total</span><span style="font-variant-numeric:tabular-nums">${fmtCurrency(totalAmount())}</span></div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <textarea id="notes" placeholder="Notes (optional)" rows="2" style="width:100%;border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--space-2) var(--space-3);font-size:var(--text-sm);resize:vertical;background:var(--color-bg-card);color:var(--color-text);font-family:var(--font-sans)">${notes}</textarea>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:var(--space-2)">
      <button class="btn btn-primary" id="create-btn" ${submitting || !selectedCustomerId || lines.every((l) => !l.description) ? "disabled" : ""}>
        ${submitting ? "Creating..." : "Create Draft Invoice"}
      </button>
    </div>
  `;

  // Event listeners
  document.getElementById("customer-select")?.addEventListener("change", (e) => { selectedCustomerId = (e.target as HTMLSelectElement).value; });
  document.getElementById("due-days")?.addEventListener("change", (e) => { dueInDays = parseInt((e.target as HTMLSelectElement).value, 10); });
  document.getElementById("notes")?.addEventListener("input", (e) => { notes = (e.target as HTMLTextAreaElement).value; });

  document.getElementById("add-line")?.addEventListener("click", () => {
    lines.push({ description: "", quantity: 1, unitPrice: 0, taxRate: 0 });
    render();
  });

  document.getElementById("item-picker")?.addEventListener("change", (e) => {
    const itemId = (e.target as HTMLSelectElement).value;
    const item = items.find((i) => i.id === itemId);
    if (item) {
      lines.push({ description: item.name, quantity: 1, unitPrice: item.unitPrice, taxRate: item.taxRate ?? 0 });
      render();
    }
  });

  root.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => { lines.splice(parseInt((btn as HTMLElement).dataset.remove!, 10), 1); render(); });
  });

  root.querySelectorAll("[data-idx]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      const idx = parseInt(el.dataset.idx!, 10);
      const field = el.dataset.field as keyof LineItem;
      if (field === "description") lines[idx][field] = el.value;
      else (lines[idx] as unknown as Record<string, number>)[field] = parseFloat(el.value) || 0;
      // Update just the amount cell, not full re-render
      const amtCell = el.closest("tr")?.querySelector("td.num");
      if (amtCell) amtCell.textContent = fmtCurrency(calcLine(lines[idx]) + calcTax(lines[idx]));
      // Update totals
      const totalSection = root.querySelector(".section:nth-last-child(3) .card");
      if (totalSection) {
        const divs = totalSection.querySelectorAll("span[style*='tabular']");
        if (divs[0]) divs[0].textContent = fmtCurrency(totalSubtotal());
        if (divs[1]) divs[1].textContent = fmtCurrency(totalTax());
        if (divs[2]) divs[2].textContent = fmtCurrency(totalAmount());
      }
    });
  });

  document.getElementById("create-btn")?.addEventListener("click", createInvoice);
}

async function createInvoice() {
  if (!selectedCustomerId || submitting) return;
  const validLines = lines.filter((l) => l.description && l.quantity > 0);
  if (validLines.length === 0) return;

  submitting = true;
  render();

  try {
    const res = await app.callServerTool({
      name: "create_invoice",
      arguments: {
        customerId: selectedCustomerId,
        dueInDays,
        notes: notes || undefined,
        lineItems: validLines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate || undefined,
        })),
      },
    });

    const result = parseToolResult<{ success: boolean; data?: { invoiceNumber?: string } }>(res);
    if (result?.success) {
      successMessage = `Invoice ${result.data?.invoiceNumber ?? ""} created`;
      lines = [{ description: "", quantity: 1, unitPrice: 0, taxRate: 0 }];
      selectedCustomerId = "";
      notes = "";
    }
  } catch (err) {
    successMessage = "";
    root.innerHTML = errorHtml(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  } finally {
    submitting = false;
  }
  render();
}

async function loadReferenceData() {
  root.innerHTML = loadingHtml("Loading...");
  try {
    const [custRes, itemRes] = await Promise.all([
      app.callServerTool({ name: "get_customers", arguments: { compact: true } }),
      app.callServerTool({ name: "get_items", arguments: {} }).catch(() => null),
    ]);

    const custData = parseToolResult<{ data?: { customers?: Customer[] } }>(custRes);
    customers = custData?.data?.customers ?? [];

    if (itemRes) {
      const itemData = parseToolResult<{ data?: { items?: Item[] } }>(itemRes);
      items = itemData?.data?.items ?? [];
    }

    render();
  } catch (err) {
    root.innerHTML = errorHtml(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
  }
}

app.connect();

let loaded = false;
app.ontoolresult = () => { loaded = true; loadReferenceData(); };
setTimeout(() => { if (!loaded) loadReferenceData(); }, 500);
