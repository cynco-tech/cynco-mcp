/**
 * Shared utilities for MCP tool implementations.
 * Eliminates duplication across create/update/delete tools.
 */
import { z } from "zod";
import type pg from "pg";
import type { Tenant } from "./validation.js";
import { tenantWhere } from "./validation.js";

// ── Shared schemas ───────────────────────────────────────────────

/** Tenant ID fields shared by every tool schema. Spread into your schema object. */
export const tenantSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
};

/** Standard line item schema for invoices, bills, quotations, POs, etc. */
export const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: z.number(),
  taxRate: z.number().optional(),
  taxCode: z.string().optional(),
});

export type LineItem = z.infer<typeof lineItemSchema>;

// ── Line item calculations ───────────────────────────────────────

export interface CalculatedLineItem extends LineItem {
  amount: number;
  taxAmount: number;
}

export interface LineItemTotals {
  items: CalculatedLineItem[];
  subtotal: number;
  totalTax: number;
  totalAmount: number;
}

/** Calculate amounts for line items. Returns items with amounts + totals. */
export function calculateLineItems(items: LineItem[]): LineItemTotals {
  const calculated = items.map((item) => {
    const amount = parseFloat((item.quantity * item.unitPrice).toFixed(2));
    const taxAmount = parseFloat((amount * ((item.taxRate ?? 0) / 100)).toFixed(2));
    return { ...item, amount, taxAmount };
  });

  const subtotal = calculated.reduce((s, i) => s + i.amount, 0);
  const totalTax = calculated.reduce((s, i) => s + i.taxAmount, 0);

  return {
    items: calculated,
    subtotal: parseFloat(subtotal.toFixed(2)),
    totalTax: parseFloat(totalTax.toFixed(2)),
    totalAmount: parseFloat((subtotal + totalTax).toFixed(2)),
  };
}

// ── Sequential number generation ─────────────────────────────────

/**
 * Generate a sequential document number with advisory lock.
 * Pattern: PREFIX-YEAR-NNNN (e.g. INV-2026-0001)
 *
 * @param client - Transaction client
 * @param tenant - Resolved tenant
 * @param table - Table name (e.g. "invoices")
 * @param column - Number column (e.g. "invoice_number")
 * @param prefix - Prefix (e.g. "INV")
 * @param lockKey - Advisory lock discriminator (e.g. "invoice-number")
 * @param padWidth - Zero-pad width (default 4)
 */
export async function generateSequenceNumber(
  client: pg.PoolClient,
  tenant: Tenant,
  table: string,
  column: string,
  prefix: string,
  lockKey: string,
  padWidth = 4,
): Promise<string> {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1 || '-' || $2))`,
    [tenant.value, lockKey],
  );

  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  const tw = tenantWhere(tenant, 1);

  const maxResult = await client.query(
    `SELECT MAX(${column}) as max_num FROM ${table}
     WHERE ${tw.sql} AND ${column} LIKE $${tw.nextParam}`,
    [...tw.params, pattern],
  );

  let nextSeq = 1;
  if (maxResult.rows[0]?.max_num) {
    const parts = (maxResult.rows[0].max_num as string).split("-");
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(parsed)) nextSeq = parsed + 1;
  }

  return `${prefix}-${year}-${String(nextSeq).padStart(padWidth, "0")}`;
}

// ── Dynamic UPDATE builder ───────────────────────────────────────

export interface UpdateBuilder {
  fields: string[];
  values: unknown[];
  paramIdx: number;
  add(column: string, value: unknown): void;
}

/** Create a dynamic UPDATE field builder. Only adds fields where value !== undefined. */
export function buildUpdateSet(startParam = 1): UpdateBuilder {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = startParam;

  return {
    fields,
    values,
    get paramIdx() { return paramIdx; },
    add(column: string, value: unknown) {
      if (value !== undefined) {
        fields.push(`${column} = $${paramIdx++}`);
        values.push(value);
      }
    },
  };
}

// ── Status transition validation ─────────────────────────────────

/**
 * Validate a status transition against allowed transitions map.
 * Returns an error message if invalid, null if valid.
 */
export function validateTransition(
  transitions: Record<string, string[]>,
  currentStatus: string,
  newStatus: string,
): string | null {
  const allowed = transitions[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(", ") || "none"}.`;
  }
  return null;
}
