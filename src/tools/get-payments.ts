import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getPaymentsSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  entityType: z.enum(["customer", "vendor"]).optional().describe("Filter by entity type"),
  entityId: z.string().optional().describe("Filter by specific customer or vendor ID"),
  direction: z.enum(["inbound", "outbound"]).optional().describe("Filter by payment direction"),
  status: z.enum(["pending", "completed", "cancelled", "failed", "refunded"]).optional().describe("Filter by payment status"),
  fromDate: z.string().optional().describe("Payments on or after (YYYY-MM-DD)"),
  toDate: z.string().optional().describe("Payments on or before (YYYY-MM-DD)"),
  isReconciled: z.boolean().optional().describe("Filter by reconciliation status"),
  limit: z.number().int().min(1).max(200).optional().default(50).describe("Max results (default 50, max 200)"),
  offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
};

export async function getPayments(args: {
  clientId?: string;
  accountingFirmId?: string;
  entityType?: "customer" | "vendor";
  entityId?: string;
  direction?: "inbound" | "outbound";
  status?: "pending" | "completed" | "cancelled" | "failed" | "refunded";
  fromDate?: string;
  toDate?: string;
  isReconciled?: boolean;
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "p");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.entityType) {
      filters += ` AND p.entity_type = $${nextParam}`;
      params.push(args.entityType);
      nextParam++;
    }

    if (args.entityId) {
      filters += ` AND p.entity_id = $${nextParam}`;
      params.push(args.entityId);
      nextParam++;
    }

    if (args.direction) {
      filters += ` AND p.direction = $${nextParam}`;
      params.push(args.direction);
      nextParam++;
    }

    if (args.status) {
      filters += ` AND p.status = $${nextParam}`;
      params.push(args.status);
      nextParam++;
    }

    if (args.fromDate) {
      filters += ` AND p.payment_date >= $${nextParam}::date`;
      params.push(args.fromDate);
      nextParam++;
    }

    if (args.toDate) {
      filters += ` AND p.payment_date <= $${nextParam}::date`;
      params.push(args.toDate);
      nextParam++;
    }

    if (args.isReconciled != null) {
      filters += ` AND p.is_reconciled = $${nextParam}`;
      params.push(args.isReconciled);
      nextParam++;
    }

    const limit = args.limit ?? 50;
    const offset = args.offset ?? 0;
    params.push(limit + 1, offset);

    const result = await query(
      `SELECT
          p.id,
          p.entity_id,
          p.entity_type,
          p.direction,
          p.amount,
          p.currency,
          p.payment_date,
          p.payment_method,
          p.reference_number,
          p.description,
          p.status,
          p.is_reconciled,
          p.invoice_id,
          p.bill_id,
          p.created_at
       FROM payments_unified p
       WHERE ${tw.sql} ${filters}
       ORDER BY p.payment_date DESC, p.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      params,
    );

    const hasMore = result.rows.length > limit;
    const payments = result.rows.slice(0, limit).map((r) => ({
      id: r.id,
      entityId: r.entity_id,
      entityType: r.entity_type,
      direction: r.direction,
      amount: r.amount,
      currency: r.currency,
      paymentDate: r.payment_date,
      paymentMethod: r.payment_method,
      referenceNumber: r.reference_number,
      description: r.description,
      status: r.status,
      isReconciled: r.is_reconciled,
      invoiceId: r.invoice_id,
      billId: r.bill_id,
      createdAt: r.created_at,
    }));

    return successResponse({
      payments,
      paymentCount: payments.length,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
