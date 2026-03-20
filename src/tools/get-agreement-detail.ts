import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getAgreementDetailSchema = {
  ...tenantSchema,
  agreementId: z.string().describe("Agreement ID"),
};

export async function getAgreementDetail(args: {
  clientId?: string; accountingFirmId?: string; agreementId: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.agreementId, "agr", "agreementId");
    const tw = tenantWhere(tenant, 2);

    const result = await query(
      `SELECT a.*,
              (SELECT json_agg(json_build_object(
                'id', s.id, 'name', s.name, 'email', s.email, 'role', s.role,
                'status', s.status, 'signedAt', s.signed_at, 'signingOrder', s.signing_order
              ) ORDER BY s.signing_order)
              FROM agreement_signers s WHERE s.agreement_id = a.id) AS signers
       FROM agreements a
       WHERE a.id = $1 AND ${tw.sql}`,
      [args.agreementId, ...tw.params]);

    if (result.rows.length === 0) {
      return errorResponse("Agreement not found or does not belong to this tenant.");
    }

    const r = result.rows[0];
    return successResponse({
      id: r.id, agreementNumber: r.agreement_number, title: r.title,
      agreementType: r.agreement_type, status: r.status,
      counterpartyName: r.counterparty_name, counterpartyEmail: r.counterparty_email,
      companyName: r.company_name, companySignerName: r.company_signer_name,
      effectiveDate: r.effective_date, expirationDate: r.expiration_date,
      executedAt: r.executed_at, terminatedAt: r.terminated_at,
      autoRenew: r.auto_renew, renewalTermMonths: r.renewal_term_months,
      financialTerms: r.financial_terms,
      signers: r.signers ?? [],
      createdAt: r.created_at, updatedAt: r.updated_at,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
