import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getCompanyProfileSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
};

export async function getCompanyProfile(args: {
  clientId?: string;
  accountingFirmId?: string;
}) {
  try {
    const tenant = resolveTenant(args);

    if (tenant.column === "client_id") {
      // Get client details
      const clientResult = await query(
        `SELECT
            cd.id,
            cd.company_name,
            cd.full_company_name,
            cd.registration_no,
            cd.registration_type,
            cd.tax_tin,
            cd.address,
            cd.contact_no,
            cd.business_entity,
            cd.industry,
            cd.primary_revenue_model,
            cd.monthly_expense,
            cd.number_of_employees,
            cd.incorporation_date,
            cd.fiscal_year_end_date,
            cd.primary_currency,
            cd.jurisdiction,
            cd.common_transaction_types,
            cd.key_suppliers_customers,
            cd.additional_company_info,
            cd.msic_code,
            cd.is_international,
            cd.created_at,
            cd.updated_at
         FROM client_details cd
         WHERE cd.id = $1`,
        [tenant.value],
      );

      if (clientResult.rows.length === 0) {
        return errorResponse("Client not found.");
      }

      const c = clientResult.rows[0];

      // Get business context paragraph
      const ctxResult = await query(
        `SELECT context_paragraph, updated_at
         FROM business_context
         WHERE client_id = $1`,
        [tenant.value],
      );

      // Get chart of accounts info
      const coaResult = await query(
        `SELECT id, name, base_currency, fiscal_year_end, current_period, accounting_standard
         FROM chart_of_accounts
         WHERE client_id = $1 AND is_active = true
         ORDER BY created_at ASC
         LIMIT 5`,
        [tenant.value],
      );

      // Get managing accounting firm (if any)
      const firmResult = await query(
        `SELECT afd.id, afd.firm_name, afd.firm_no
         FROM accnt_clients ac
         JOIN accounting_firm_details afd ON afd.id = ac.accnt_firm_id
         WHERE ac.client_id = $1`,
        [tenant.value],
      );

      return successResponse({
        tenantType: "client",
        company: {
          id: c.id,
          companyName: c.company_name,
          fullCompanyName: c.full_company_name,
          registrationNo: c.registration_no,
          registrationType: c.registration_type,
          taxTin: c.tax_tin,
          address: c.address,
          contactNo: c.contact_no,
          businessEntity: c.business_entity,
          industry: c.industry,
          primaryRevenueModel: c.primary_revenue_model,
          monthlyExpense: c.monthly_expense,
          numberOfEmployees: c.number_of_employees,
          incorporationDate: c.incorporation_date,
          fiscalYearEndDate: c.fiscal_year_end_date,
          primaryCurrency: c.primary_currency,
          jurisdiction: c.jurisdiction,
          msicCode: c.msic_code,
          isInternational: c.is_international,
          commonTransactionTypes: c.common_transaction_types,
          keySuppliersCustomers: c.key_suppliers_customers,
          additionalCompanyInfo: c.additional_company_info,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        },
        businessContext: ctxResult.rows.length > 0
          ? {
              paragraph: ctxResult.rows[0].context_paragraph,
              lastUpdated: ctxResult.rows[0].updated_at,
            }
          : null,
        chartsOfAccounts: coaResult.rows.map((r) => ({
          id: r.id,
          name: r.name,
          baseCurrency: r.base_currency,
          fiscalYearEnd: r.fiscal_year_end,
          currentPeriod: r.current_period,
          accountingStandard: r.accounting_standard,
        })),
        managingFirm: firmResult.rows.length > 0
          ? {
              id: firmResult.rows[0].id,
              firmName: firmResult.rows[0].firm_name,
              firmNo: firmResult.rows[0].firm_no,
            }
          : null,
      });
    } else {
      // Accounting firm tenant
      const firmResult = await query(
        `SELECT
            afd.id,
            afd.firm_name,
            afd.firm_no,
            afd.firm_address,
            afd.client_amnt,
            afd.staff_amnt,
            afd.other_software,
            afd.accounting_body,
            afd.accounting_body_member_no,
            afd.created_at,
            afd.updated_at
         FROM accounting_firm_details afd
         WHERE afd.id = $1`,
        [tenant.value],
      );

      if (firmResult.rows.length === 0) {
        return errorResponse("Accounting firm not found.");
      }

      const f = firmResult.rows[0];

      // Get business context
      const ctxResult = await query(
        `SELECT context_paragraph, updated_at
         FROM business_context
         WHERE accounting_firm_id = $1`,
        [tenant.value],
      );

      // Get managed clients
      const clientsResult = await query(
        `SELECT
            cd.id,
            cd.company_name,
            cd.registration_no,
            cd.business_entity,
            cd.industry,
            cd.primary_currency,
            cd.jurisdiction
         FROM accnt_clients ac
         JOIN client_details cd ON cd.id = ac.client_id
         WHERE ac.accnt_firm_id = $1
         ORDER BY cd.company_name`,
        [tenant.value],
      );

      return successResponse({
        tenantType: "accountingFirm",
        firm: {
          id: f.id,
          firmName: f.firm_name,
          firmNo: f.firm_no,
          firmAddress: f.firm_address,
          clientCount: f.client_amnt,
          staffCount: f.staff_amnt,
          otherSoftware: f.other_software,
          accountingBody: f.accounting_body,
          accountingBodyMemberNo: f.accounting_body_member_no,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        },
        businessContext: ctxResult.rows.length > 0
          ? {
              paragraph: ctxResult.rows[0].context_paragraph,
              lastUpdated: ctxResult.rows[0].updated_at,
            }
          : null,
        managedClients: clientsResult.rows.map((r) => ({
          id: r.id,
          companyName: r.company_name,
          registrationNo: r.registration_no,
          businessEntity: r.business_entity,
          industry: r.industry,
          primaryCurrency: r.primary_currency,
          jurisdiction: r.jurisdiction,
        })),
      });
    }
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
