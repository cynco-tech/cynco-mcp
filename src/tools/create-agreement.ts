import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { generateSequenceNumber, tenantSchema } from "../utils/tools.js";

export const createAgreementSchema = {
  ...tenantSchema,
  title: z.string().min(1).max(500).describe("Agreement title"),
  agreementType: z.enum(["contract", "proposal", "engagement_letter", "nda", "msa", "sow", "amendment", "renewal", "custom"]).describe("Agreement type"),
  counterpartyName: z.string().max(255).describe("Counterparty name"),
  counterpartyEmail: z.string().email().max(255).optional().describe("Counterparty email"),
  customerId: z.string().optional().describe("Link to existing customer"),
  vendorId: z.string().optional().describe("Link to existing vendor"),
  effectiveDate: z.string().optional().describe("Effective date (ISO 8601)"),
  expirationDate: z.string().optional().describe("Expiration date (ISO 8601)"),
  templateId: z.string().optional().describe("Contract template ID to use"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createAgreement(args: {
  clientId?: string; accountingFirmId?: string;
  title: string; agreementType: string;
  counterpartyName: string; counterpartyEmail?: string;
  customerId?: string; vendorId?: string;
  effectiveDate?: string; expirationDate?: string;
  templateId?: string; createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate customer belongs to tenant (if provided)
      if (args.customerId) {
        validateTypeId(args.customerId, "cust", "customerId");
        const custTw = tenantWhere(tenant, 2);
        const custResult = await client.query(
          `SELECT id FROM customers WHERE id = $1 AND ${custTw.sql} AND is_active = true`,
          [args.customerId, ...custTw.params],
        );
        if (custResult.rows.length === 0) return errorResponse("Customer not found or does not belong to this tenant.");
      }

      // Validate vendor belongs to tenant (if provided)
      if (args.vendorId) {
        validateTypeId(args.vendorId, "vend", "vendorId");
        const vendTw = tenantWhere(tenant, 2);
        const vendResult = await client.query(
          `SELECT id FROM vendors WHERE id = $1 AND ${vendTw.sql} AND is_active = true`,
          [args.vendorId, ...vendTw.params],
        );
        if (vendResult.rows.length === 0) return errorResponse("Vendor not found or does not belong to this tenant.");
      }

      // Generate agreement number
      const agreementNumber = await generateSequenceNumber(client, tenant, "agreements", "agreement_number", "AGR", "agreement-number");
      const agreementId = generateId("agr");

      await client.query(
        `INSERT INTO agreements (
          id, agreement_number, title, agreement_type, status,
          counterparty_name, counterparty_email,
          customer_id, vendor_id,
          effective_date, expiration_date, template_id,
          user_id, client_id, accounting_firm_id, is_archived,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'draft',
          $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, false, NOW(), NOW()
        )`,
        [
          agreementId, agreementNumber, args.title, args.agreementType,
          args.counterpartyName, args.counterpartyEmail ?? null,
          args.customerId ?? null, args.vendorId ?? null,
          args.effectiveDate ?? null, args.expirationDate ?? null, args.templateId ?? null,
          args.createdBy, tenant.clientId, tenant.accountingFirmId,
        ]);

      return successResponse({
        id: agreementId, agreementNumber, status: "draft",
        title: args.title, agreementType: args.agreementType,
        counterpartyName: args.counterpartyName,
      });
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
