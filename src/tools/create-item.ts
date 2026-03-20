import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const createItemSchema = {
  ...tenantSchema,
  name: z.string().min(1).max(255).describe("Item name"),
  description: z.string().optional().describe("Item description"),
  unitPrice: z.number().min(0).describe("Unit price"),
  taxRate: z.number().min(0).max(100).optional().describe("Tax rate percentage (default 0)"),
  discountRate: z.number().min(0).max(100).optional().describe("Discount rate percentage (default 0)"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createItem(args: {
  clientId?: string;
  accountingFirmId?: string;
  name: string;
  description?: string;
  unitPrice: number;
  taxRate?: number;
  discountRate?: number;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      const itemId = generateId("item");

      await client.query(
        `INSERT INTO items (
          id, name, description, unit_price, tax_rate, discount_rate,
          created_by, client_id, accounting_firm_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        [
          itemId, args.name, args.description ?? null,
          args.unitPrice, args.taxRate ?? 0, args.discountRate ?? 0,
          args.createdBy, tenant.clientId, tenant.accountingFirmId,
        ],
      );

      return successResponse({
        id: itemId,
        name: args.name,
        unitPrice: args.unitPrice,
        taxRate: args.taxRate ?? 0,
        discountRate: args.discountRate ?? 0,
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
