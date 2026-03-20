import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import {
  lineItemSchema,
  calculateLineItems,
  tenantSchema,
  type LineItem,
} from "../utils/tools.js";

export const createRecurringInvoiceSchema = {
  ...tenantSchema,
  customerId: z.string().describe("Customer ID"),
  frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly", "semiannually", "annually"]).describe("Recurrence frequency"),
  startDate: z.string().describe("Start date (ISO 8601)"),
  endDate: z.string().optional().describe("End date (ISO 8601, null = no end)"),
  lineItems: z.array(lineItemSchema).min(1).describe("Line items"),
  currency: z.string().optional().default("MYR").describe("Currency code"),
  paymentTerms: z.string().max(100).optional().describe("Payment terms"),
  memo: z.string().max(500).optional().describe("Internal memo"),
  autoSend: z.boolean().optional().describe("Auto-send generated invoices"),
  autoFinalize: z.boolean().optional().describe("Auto-finalize generated invoices (default true)"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createRecurringInvoice(args: {
  clientId?: string;
  accountingFirmId?: string;
  customerId: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  lineItems: LineItem[];
  currency?: string;
  paymentTerms?: string;
  memo?: string;
  autoSend?: boolean;
  autoFinalize?: boolean;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.customerId, "cust", "customerId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      const custTw = tenantWhere(tenant, 2);
      const custResult = await client.query(
        `SELECT id, name, email FROM customers WHERE id = $1 AND ${custTw.sql} AND is_active = true`,
        [args.customerId, ...custTw.params],
      );
      if (custResult.rows.length === 0) {
        return errorResponse("Customer not found or does not belong to this tenant.");
      }
      const customer = custResult.rows[0];

      const { items: calculatedItems, totalTax: totalTaxes, totalAmount } = calculateLineItems(args.lineItems);

      const templateId = generateId("ritpl");
      await client.query(
        `INSERT INTO recurring_invoice_templates (
          id, frequency, start_date, end_date, next_generation_date, status,
          customer_id, customer_name, customer_email, currency,
          line_items, taxes, total_amount, payment_terms, memo,
          auto_send, auto_finalize, total_generated,
          client_id, accounting_firm_id, created_by,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $3, 'active',
          $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, 0,
          $16, $17, $18,
          NOW(), NOW()
        )`,
        [
          templateId, args.frequency, args.startDate, args.endDate ?? null,
          args.customerId, customer.name, customer.email, args.currency ?? "MYR",
          JSON.stringify(calculatedItems), totalTaxes.toFixed(2), totalAmount.toFixed(2),
          args.paymentTerms ?? null, args.memo ?? null,
          args.autoSend ?? false, args.autoFinalize ?? true,
          tenant.clientId, tenant.accountingFirmId, args.createdBy,
        ],
      );

      return successResponse({
        id: templateId,
        frequency: args.frequency,
        status: "active",
        customerName: customer.name,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        nextGenerationDate: args.startDate,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
