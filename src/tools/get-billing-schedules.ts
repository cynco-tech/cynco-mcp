import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getBillingSchedulesSchema = {
  ...tenantSchema,
  agreementId: z.string().optional().describe("Filter by agreement ID"),
  status: z.string().optional().describe("Filter by status"),
};

export async function getBillingSchedules(args: {
  clientId?: string; accountingFirmId?: string; agreementId?: string; status?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "bs");
    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = ` AND bs.is_archived = false`;
    if (args.agreementId) { filters += ` AND bs.agreement_id = $${nextParam}`; params.push(args.agreementId); nextParam++; }
    if (args.status) { filters += ` AND bs.status = $${nextParam}`; params.push(args.status); nextParam++; }

    const result = await query(
      `SELECT bs.id, bs.agreement_id, bs.name, bs.status, bs.total_value, bs.total_billed,
              bs.total_paid, bs.currency, bs.customer_name, bs.billing_type, bs.created_at,
              (SELECT json_agg(json_build_object(
                'id', m.id, 'name', m.name, 'amount', m.amount, 'dueDate', m.due_date,
                'status', m.status, 'sortOrder', m.sort_order
              ) ORDER BY m.sort_order)
              FROM billing_schedule_milestones m WHERE m.billing_schedule_id = bs.id) AS milestones
       FROM billing_schedules bs WHERE ${tw.sql} ${filters} ORDER BY bs.created_at DESC`, params);

    return successResponse({
      schedules: result.rows.map(r => ({
        id: r.id, agreementId: r.agreement_id, name: r.name, status: r.status,
        totalValue: r.total_value, totalBilled: r.total_billed, totalPaid: r.total_paid,
        currency: r.currency, customerName: r.customer_name, billingType: r.billing_type,
        milestones: r.milestones ?? [], createdAt: r.created_at,
      })),
      scheduleCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
