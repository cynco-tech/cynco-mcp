import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getCustomersSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  search: z.string().max(200).optional().describe("Search by name, email, or registration number"),
  includeInactive: z.boolean().optional().default(false).describe("Include inactive customers"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getCustomers(args: {
  clientId?: string;
  accountingFirmId?: string;
  search?: string;
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "c");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (!args.includeInactive) {
      filters += ` AND c.is_active = true`;
    }
    if (args.search) {
      const searchLike = `%${args.search.toLowerCase()}%`;
      filters += ` AND (
        LOWER(c.name) LIKE $${nextParam}
        OR LOWER(COALESCE(c.email, '')) LIKE $${nextParam}
        OR LOWER(COALESCE(c.registration_number, '')) LIKE $${nextParam}
      )`;
      params.push(searchLike);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          c.id,
          c.name,
          c.email,
          c.phone,
          c.address,
          c.city,
          c.state,
          c.country,
          c.registration_number,
          c.tax_id,
          c.payment_terms,
          c.preferred_payment_method,
          c.preferred_currency,
          c.credit_limit,
          c.category,
          c.notes,
          c.is_active,
          c.default_revenue_account_id,
          c.default_receivable_account_id,
          c.created_at,
          c.updated_at,
          (SELECT COUNT(*) FROM invoices i
           WHERE i.customer_id = c.id
             AND i.status NOT IN ('draft', 'quotation')
             AND (i.is_archived = false OR i.is_archived IS NULL)
          ) AS total_invoices,
          (SELECT COALESCE(SUM(i.total_amount - COALESCE(i.paid_amount, 0)), 0)
           FROM invoices i
           WHERE i.customer_id = c.id
             AND i.status IN ('finalized', 'partially_paid', 'overdue', 'awaiting_payment')
             AND (i.total_amount - COALESCE(i.paid_amount, 0)) > 0
          ) AS outstanding_balance
       FROM customers c
       WHERE ${tw.sql} ${filters}
       ORDER BY c.name
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const customers = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      address: r.address,
      city: r.city,
      state: r.state,
      country: r.country,
      registrationNumber: r.registration_number,
      taxId: r.tax_id,
      paymentTerms: r.payment_terms,
      preferredPaymentMethod: r.preferred_payment_method,
      preferredCurrency: r.preferred_currency,
      creditLimit: r.credit_limit,
      category: r.category,
      notes: r.notes,
      isActive: r.is_active,
      defaultRevenueAccountId: r.default_revenue_account_id,
      defaultReceivableAccountId: r.default_receivable_account_id,
      totalInvoices: parseInt(r.total_invoices as string, 10),
      outstandingBalance: parseFloat(r.outstanding_balance as string).toFixed(2),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return successResponse({
      customers,
      customerCount: customers.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
