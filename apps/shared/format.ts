/**
 * Shared formatting utilities for Cynco MCP Apps.
 * Matches the conventions in cynco://guide/presentation.
 */

/** Escape HTML to prevent XSS when rendering user-controlled strings */
export function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format currency with locale-appropriate separators. Uses RM for MYR. */
export function fmtCurrency(amount: number, currency = "MYR"): string {
  const sym = currency === "MYR" ? "RM" : currency === "USD" ? "$" : currency;
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount < 0) return `(${sym} ${formatted})`;
  return `${sym} ${formatted}`;
}

/** Short currency for KPI tiles (e.g., "RM 12.5K", "RM 1.2M") */
export function fmtCompact(amount: number, currency = "MYR"): string {
  const sym = currency === "MYR" ? "RM" : currency === "USD" ? "$" : currency;
  const abs = Math.abs(amount);
  let str: string;
  if (abs >= 1_000_000) str = `${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 10_000) str = `${(abs / 1_000).toFixed(1)}K`;
  else str = abs.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return amount < 0 ? `(${sym} ${str})` : `${sym} ${str}`;
}

/** Format percentage with 1 decimal */
export function fmtPct(value: number): string {
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)}%`;
}

/** Format a YYYY-MM period into human-readable "Jan 2026" */
export function fmtPeriod(period: string): string {
  const [year, month] = period.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(month, 10) - 1] || month} ${year}`;
}

/** Format a date string to "25 Jan 2026" */
export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Get YYYY-MM for today */
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Extract text content from MCP tool result */
export function extractText(result: { content?: Array<{ type: string; text?: string }> }): string {
  if (!result?.content) return "{}";
  const textItem = result.content.find((c) => c.type === "text");
  return textItem?.text ?? "{}";
}

/** Safely parse JSON from tool result, returning null on failure */
export function parseToolResult<T = unknown>(result: { content?: Array<{ type: string; text?: string }> }): T | null {
  try {
    return JSON.parse(extractText(result)) as T;
  } catch {
    return null;
  }
}

/** Create a simple SVG donut chart. Returns an SVG string. */
export function donutSvg(
  segments: Array<{ value: number; color: string; label: string }>,
  size = 120,
  thickness = 24,
): string {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${(size - thickness) / 2}" fill="none" stroke="var(--color-border)" stroke-width="${thickness}"/>
    </svg>`;
  }

  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = -circumference / 4; // Start from top

  const paths = segments.map((seg) => {
    const pct = seg.value / total;
    const dashLen = pct * circumference;
    const path = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${seg.color}" stroke-width="${thickness}"
      stroke-dasharray="${dashLen} ${circumference - dashLen}"
      stroke-dashoffset="${-offset}" />`;
    offset += dashLen;
    return path;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join("")}</svg>`;
}

/** Create the loading spinner HTML */
export function loadingHtml(message = "Loading..."): string {
  return `<div class="loading"><div class="spinner"></div>${esc(message)}</div>`;
}

/** Create error display HTML */
export function errorHtml(message: string): string {
  return `<div class="error-box">${esc(message)}</div>`;
}
