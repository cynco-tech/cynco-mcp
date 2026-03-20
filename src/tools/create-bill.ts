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

export const createBillSchema = {
  ...tenantSchema,
  vendorId: z.string().describe("Vendor ID"),
  lineItems: z.array(lineItemSchema).min(1).describe("Bill line items"),
  currency: z.string().optional().default("MYR").describe("Currency code"),
  dueDate: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  referenceNumber: z.string().max(100).optional().describe("Vendor's invoice/reference number"),
  category: z.string().max(100).optional().describe("Expense category"),
  memo: z.string().max(500).optional().describe("Internal memo"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createBill(args: {
  clientId?: string;
  accountingFirmId?: string;
  vendorId: string;
  lineItems: LineItem[];
  currency?: string;
  dueDate?: string;
  referenceNumber?: string;
  category?: string;
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

      // Generate bill number
      const billNumber = await generateSequenceNumber(client, tenant, "bills", "bill_number", "BIL", "bill-number");
      const billId = generateId("bil");

      await client.query(
        `INSERT INTO bills (
          id, vendor_id, vendor_name, bill_number, reference_number,
          status, currency, subtotal_amount, tax_amount, total_amount,
          line_items, issue_date, due_date, category, memo,
          client_id, accounting_firm_id, created_by, is_archived,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'draft', $6, $7, $8, $9,
          $10, NOW(), $11, $12, $13,
          $14, $15, $16, false,
          NOW(), NOW()
        )`,
        [
          billId, args.vendorId, vendorResult.rows[0].name, billNumber, args.referenceNumber ?? null,
          args.currency ?? "MYR", subtotal.toFixed(2), taxAmount.toFixed(2), totalAmount.toFixed(2),
          JSON.stringify(calculatedItems), args.dueDate ?? null, args.category ?? null, args.memo ?? null,
          tenant.clientId, tenant.accountingFirmId, args.createdBy,
        ],
      );

      return successResponse({
        id: billId,
        billNumber,
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
