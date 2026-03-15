import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getVendorsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  search: z.string().max(200).optional().describe("Fuzzy search by name, email, or registration number"),
  category: z.string().max(100).optional().describe("Filter by category (e.g. 'Supplier', 'Service Provider')"),
  isActive: z.boolean().optional().default(true).describe("Filter by active status (default true)"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getVendors(args: {
  clientId?: string;
  accountingFirmId?: string;
  search?: string;
  category?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "v");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    // isActive defaults to true if not explicitly set to false
    if (args.isActive !== false) {
      filters += ` AND v.is_active = true`;
    }

    if (args.search) {
      const searchLike = `%${args.search.toLowerCase()}%`;
      filters += ` AND (
        LOWER(v.name) LIKE $${nextParam}
        OR LOWER(COALESCE(v.email, '')) LIKE $${nextParam}
        OR LOWER(COALESCE(v.registration_number, '')) LIKE $${nextParam}
      )`;
      params.push(searchLike);
      nextParam++;
    }

    if (args.category) {
      filters += ` AND v.category = $${nextParam}`;
      params.push(args.category);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          v.id,
          v.name,
          v.email,
          v.phone,
          v.website,
          v.address,
          v.city,
          v.state,
          v.zip,
          v.country,
          v.registration_number,
          v.tax_id,
          v.payment_terms,
          v.preferred_payment_method,
          v.bank_account_number,
          v.bank_name,
          v.bank_branch,
          v.category,
          v.is_active,
          v.default_expense_account_id,
          v.default_payable_account_id,
          ea.name AS default_expense_account_name,
          pa.name AS default_payable_account_name,
          v.created_at,
          v.updated_at,
          (SELECT COUNT(*) FROM bills b
           WHERE b.vendor_id = v.id
             AND b.status NOT IN ('paid', 'void')
             AND b.is_archived = false
          ) AS outstanding_bills,
          (SELECT COALESCE(SUM(b.total_amount - COALESCE(bp_sum.paid, 0)), 0)
           FROM bills b
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(amount), 0) AS paid
             FROM bill_payments WHERE bill_id = b.id AND status = 'completed'
           ) bp_sum ON true
           WHERE b.vendor_id = v.id
             AND b.status IN ('awaiting_payment', 'partially_paid', 'overdue', 'approved')
             AND b.is_archived = false
          ) AS outstanding_balance
       FROM vendors v
       LEFT JOIN accounts ea ON ea.id = v.default_expense_account_id
       LEFT JOIN accounts pa ON pa.id = v.default_payable_account_id
       WHERE ${tw.sql} ${filters}
       ORDER BY v.name
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const vendors = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      website: r.website,
      address: r.address,
      city: r.city,
      state: r.state,
      zip: r.zip,
      country: r.country,
      registrationNumber: r.registration_number,
      taxId: r.tax_id,
      paymentTerms: r.payment_terms,
      preferredPaymentMethod: r.preferred_payment_method,
      bankAccountNumber: r.bank_account_number,
      bankName: r.bank_name,
      bankBranch: r.bank_branch,
      category: r.category,
      isActive: r.is_active,
      defaultExpenseAccountId: r.default_expense_account_id,
      defaultExpenseAccountName: r.default_expense_account_name,
      defaultPayableAccountId: r.default_payable_account_id,
      defaultPayableAccountName: r.default_payable_account_name,
      outstandingBills: parseInt(r.outstanding_bills as string, 10),
      outstandingBalance: parseFloat(r.outstanding_balance as string).toFixed(2),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return successResponse({
      vendors,
      vendorCount: vendors.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
