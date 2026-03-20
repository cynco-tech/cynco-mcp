import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import { tenantSchema, buildUpdateSet } from "../utils/tools.js";

export const updateVendorSchema = {
  ...tenantSchema,
  vendorId: z.string().describe("Vendor ID to update"),
  name: z.string().min(1).max(255).optional().describe("Vendor name"),
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
  paymentTerms: z.string().max(100).optional().describe("Payment terms"),
  preferredPaymentMethod: z.string().max(50).optional().describe("Preferred payment method"),
  bankAccountNumber: z.string().max(100).optional().describe("Bank account number"),
  bankName: z.string().max(255).optional().describe("Bank name"),
  bankBranch: z.string().max(255).optional().describe("Bank branch"),
  category: z.string().max(100).optional().describe("Vendor category"),
};

export async function updateVendor(args: {
  clientId?: string;
  accountingFirmId?: string;
  vendorId: string;
  name?: string;
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
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.vendorId, "vend", "vendorId");

    return await withTransaction(async (client: pg.PoolClient) => {
      const tw = tenantWhere(tenant, 2);
      const existing = await client.query(
        `SELECT id, name, email FROM vendors WHERE id = $1 AND ${tw.sql} FOR UPDATE`,
        [args.vendorId, ...tw.params],
      );
      if (existing.rows.length === 0) {
        return errorResponse("Vendor not found or does not belong to this tenant.");
      }

      const upd = buildUpdateSet();

      upd.add("name", args.name);
      upd.add("email", args.email);
      upd.add("phone", args.phone);
      upd.add("website", args.website);
      upd.add("address", args.address);
      upd.add("city", args.city);
      upd.add("state", args.state);
      upd.add("zip", args.zip);
      upd.add("country", args.country);
      upd.add("registration_number", args.registrationNumber);
      upd.add("tax_id", args.taxId);
      upd.add("payment_terms", args.paymentTerms);
      upd.add("preferred_payment_method", args.preferredPaymentMethod);
      upd.add("bank_account_number", args.bankAccountNumber);
      upd.add("bank_name", args.bankName);
      upd.add("bank_branch", args.bankBranch);
      upd.add("category", args.category);

      if (upd.fields.length === 0) {
        return errorResponse("No fields to update.");
      }

      upd.fields.push(`updated_at = NOW()`);
      upd.values.push(args.vendorId);

      await client.query(
        `UPDATE vendors SET ${upd.fields.join(", ")} WHERE id = $${upd.paramIdx}`,
        upd.values,
      );

      const updated = await client.query(
        `SELECT id, name, email, is_active, updated_at FROM vendors WHERE id = $1`,
        [args.vendorId],
      );

      return successResponse({
        before: { name: existing.rows[0].name, email: existing.rows[0].email },
        after: {
          id: updated.rows[0].id,
          name: updated.rows[0].name,
          email: updated.rows[0].email,
          isActive: updated.rows[0].is_active,
          updatedAt: updated.rows[0].updated_at,
        },
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
