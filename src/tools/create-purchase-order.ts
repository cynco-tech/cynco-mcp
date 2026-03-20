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

export const createPurchaseOrderSchema = {
  ...tenantSchema,
  vendorId: z.string().describe("Vendor ID"),
  lineItems: z.array(lineItemSchema).min(1).describe("PO line items"),
  currency: z.string().optional().default("MYR").describe("Currency code"),
  expectedDeliveryDate: z.string().optional().describe("Expected delivery date (ISO 8601)"),
  shippingAddress: z.string().optional().describe("Shipping address"),
  memo: z.string().max(500).optional().describe("Internal memo"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createPurchaseOrder(args: {
  clientId?: string;
  accountingFirmId?: string;
  vendorId: string;
  lineItems: LineItem[];
  currency?: string;
  expectedDeliveryDate?: string;
  shippingAddress?: string;
  memo?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.vendorId, "vend", "vendorId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      const vTw = tenantWhere(tenant, 2);
      const vendorResult = await client.query(
        `SELECT id, name FROM vendors WHERE id = $1 AND ${vTw.sql} AND is_active = true`,
        [args.vendorId, ...vTw.params],
      );
      if (vendorResult.rows.length === 0) {
        return errorResponse("Vendor not found or does not belong to this tenant.");
      }

      const { items: calculatedItems, subtotal, totalTax: taxAmount, totalAmount } = calculateLineItems(args.lineItems);

      // Generate PO number
      const poNumber = await generateSequenceNumber(client, tenant, "purchase_orders", "po_number", "PO", "po-number");
      const poId = generateId("po");

      await client.query(
        `INSERT INTO purchase_orders (
          id, po_number, vendor_id, vendor_name, status, currency,
          subtotal_amount, tax_amount, total_amount, line_items,
          issue_date, expected_delivery_date, shipping_address, memo,
          client_id, accounting_firm_id, created_by, is_archived,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'draft', $5,
          $6, $7, $8, $9,
          NOW(), $10, $11, $12,
          $13, $14, $15, false,
          NOW(), NOW()
        )`,
        [
          poId, poNumber, args.vendorId, vendorResult.rows[0].name, args.currency ?? "MYR",
          subtotal.toFixed(2), taxAmount.toFixed(2), totalAmount.toFixed(2), JSON.stringify(calculatedItems),
          args.expectedDeliveryDate ?? null, args.shippingAddress ?? null, args.memo ?? null,
          tenant.clientId, tenant.accountingFirmId, args.createdBy,
        ],
      );

      return successResponse({
        id: poId,
        poNumber,
        status: "draft",
        vendorName: vendorResult.rows[0].name,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
