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
  generateSequenceNumber,
  tenantSchema,
  type LineItem,
} from "../utils/tools.js";

export const createQuotationSchema = {
  ...tenantSchema,
  customerId: z.string().describe("Customer ID"),
  lineItems: z.array(lineItemSchema).min(1).describe("Quotation line items"),
  currency: z.string().optional().default("MYR").describe("Currency code"),
  validUntil: z.string().optional().describe("Expiry date (ISO 8601)"),
  memo: z.string().max(500).optional().describe("Internal memo"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createQuotation(args: {
  clientId?: string;
  accountingFirmId?: string;
  customerId: string;
  lineItems: LineItem[];
  currency?: string;
  validUntil?: string;
  memo?: string;
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

      // Generate quotation number with advisory lock
      const quotationNumber = await generateSequenceNumber(client, tenant, "quotations", "quotation_number", "QUO", "quotation-number");
      const quotationId = generateId("quot");

      await client.query(
        `INSERT INTO quotations (
          id, quotation_number, user_id, client_id, accounting_firm_id,
          customer_id, customer_name, customer_email,
          line_items, taxes, total_amount, currency, status,
          valid_until, memo, is_archived, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11, $12, 'draft',
          $13, $14, false, NOW(), NOW()
        )`,
        [
          quotationId, quotationNumber, args.createdBy, tenant.clientId, tenant.accountingFirmId,
          args.customerId, customer.name, customer.email,
          JSON.stringify(calculatedItems), totalTaxes.toFixed(2), totalAmount.toFixed(2),
          args.currency ?? "MYR",
          args.validUntil ?? null, args.memo ?? null,
        ],
      );

      return successResponse({
        id: quotationId,
        quotationNumber,
        status: "draft",
        customerName: customer.name,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
