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
import { tenantSchema, validateTenantUser } from "../utils/tools.js";

export const createCustomerSchema = {
  ...tenantSchema,
  name: z.string().min(1).max(255).describe("Customer name"),
  email: z.string().email().max(255).describe("Customer email"),
  phone: z.string().max(20).optional().describe("Phone number"),
  address: z.string().max(500).optional().describe("Street address"),
  city: z.string().max(100).optional().describe("City"),
  state: z.string().max(100).optional().describe("State/Province"),
  zip: z.string().max(20).optional().describe("Postal code"),
  country: z.string().max(100).optional().describe("Country"),
  registrationNumber: z.string().max(100).optional().describe("Business registration number"),
  taxId: z.string().max(100).optional().describe("Tax identification number"),
  paymentTerms: z.string().max(100).optional().describe("Payment terms (e.g. Net 30)"),
  preferredPaymentMethod: z.string().max(50).optional().describe("Preferred payment method"),
  preferredCurrency: z.string().max(3).optional().describe("Preferred currency code"),
  creditLimit: z.number().finite().optional().describe("Credit limit amount"),
  category: z.string().max(100).optional().describe("Customer category"),
  notes: z.string().optional().describe("Internal notes"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createCustomer(args: {
  clientId?: string;
  accountingFirmId?: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  registrationNumber?: string;
  taxId?: string;
  paymentTerms?: string;
  preferredPaymentMethod?: string;
  preferredCurrency?: string;
  creditLimit?: number;
  category?: string;
  notes?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      const userCheck = await validateTenantUser(client, args.createdBy, tenant, "createdBy");
      if (!userCheck.valid) {
        return errorResponse(userCheck.error);
      }

      // Advisory lock on tenant + email to prevent TOCTOU race on duplicate check
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || '-customer-email-' || $2))`,
        [tenant.value, args.email.toLowerCase()],
      );

      // Check for duplicate email within tenant
      const tw = tenantWhere(tenant, 2);
      const dupResult = await client.query(
        `SELECT id FROM customers WHERE LOWER(email) = LOWER($1) AND ${tw.sql} AND is_active = true`,
        [args.email, ...tw.params],
      );
      if (dupResult.rows.length > 0) {
        return errorResponse(`A customer with email "${args.email}" already exists.`);
      }

      const customerId = generateId("cust");

      await client.query(
        `INSERT INTO customers (
          id, name, email, phone, address, city, state, zip, country,
          registration_number, tax_id, payment_terms, preferred_payment_method,
          preferred_currency, credit_limit, category, notes,
          is_active, created_by, client_id, accounting_firm_id,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          true, $18, $19, $20,
          NOW(), NOW()
        )`,
        [
          customerId, args.name, args.email, args.phone ?? null,
          args.address ?? null, args.city ?? null, args.state ?? null,
          args.zip ?? null, args.country ?? null,
          args.registrationNumber ?? null, args.taxId ?? null,
          args.paymentTerms ?? null, args.preferredPaymentMethod ?? null,
          args.preferredCurrency ?? null, args.creditLimit ?? null,
          args.category ?? null, args.notes ?? null,
          args.createdBy, tenant.clientId, tenant.accountingFirmId,
        ],
      );

      return successResponse({
        id: customerId,
        name: args.name,
        email: args.email,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
