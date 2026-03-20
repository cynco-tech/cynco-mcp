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
import { tenantSchema } from "../utils/tools.js";

export const createVendorSchema = {
  ...tenantSchema,
  name: z.string().min(1).max(255).describe("Vendor name"),
  email: z.string().email().max(255).optional().describe("Vendor email"),
  phone: z.string().max(20).optional().describe("Phone number"),
  website: z.string().max(255).optional().describe("Website URL"),
  address: z.string().max(500).optional().describe("Street address"),
  city: z.string().max(100).optional().describe("City"),
  state: z.string().max(100).optional().describe("State/Province"),
  zip: z.string().max(20).optional().describe("Postal code"),
  country: z.string().max(100).optional().describe("Country"),
  registrationNumber: z.string().max(100).optional().describe("Business registration number"),
  taxId: z.string().max(100).optional().describe("Tax identification number"),
  paymentTerms: z.string().max(100).optional().describe("Payment terms (e.g. Net 30)"),
  preferredPaymentMethod: z.string().max(50).optional().describe("Preferred payment method"),
  bankAccountNumber: z.string().max(100).optional().describe("Bank account number"),
  bankName: z.string().max(255).optional().describe("Bank name"),
  bankBranch: z.string().max(255).optional().describe("Bank branch"),
  category: z.string().max(100).optional().describe("Vendor category"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createVendor(args: {
  clientId?: string;
  accountingFirmId?: string;
  name: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  registrationNumber?: string;
  taxId?: string;
  paymentTerms?: string;
  preferredPaymentMethod?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankBranch?: string;
  category?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.createdBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(`User not found: ${args.createdBy}`);
      }

      const vendorId = generateId("vend");

      await client.query(
        `INSERT INTO vendors (
          id, name, email, phone, website, address, city, state, zip, country,
          registration_number, tax_id, payment_terms, preferred_payment_method,
          bank_account_number, bank_name, bank_branch, category,
          is_active, created_by, client_id, accounting_firm_id,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          true, $19, $20, $21,
          NOW(), NOW()
        )`,
        [
          vendorId, args.name, args.email ?? null, args.phone ?? null,
          args.website ?? null, args.address ?? null, args.city ?? null,
          args.state ?? null, args.zip ?? null, args.country ?? null,
          args.registrationNumber ?? null, args.taxId ?? null,
          args.paymentTerms ?? null, args.preferredPaymentMethod ?? null,
          args.bankAccountNumber ?? null, args.bankName ?? null,
          args.bankBranch ?? null, args.category ?? null,
          args.createdBy, tenant.clientId, tenant.accountingFirmId,
        ],
      );

      return successResponse({
        id: vendorId,
        name: args.name,
        email: args.email ?? null,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
