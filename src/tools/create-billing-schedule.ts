import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import { resolveTenant, tenantWhere, validateTypeId, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

const milestoneSchema = z.object({
  name: z.string().min(1).max(255),
  amount: z.number().min(0),
  dueDate: z.string().describe("Due date (ISO 8601)"),
});

export const createBillingScheduleSchema = {
  ...tenantSchema,
  agreementId: z.string().describe("Agreement ID to link"),
  name: z.string().min(1).max(255).describe("Schedule name"),
  customerId: z.string().describe("Customer ID"),
  billingType: z.enum(["recurring", "milestone", "hybrid"]).describe("Billing type"),
  currency: z.string().optional().default("MYR").describe("Currency"),
  milestones: z.array(milestoneSchema).optional().describe("Milestones (for milestone/hybrid type)"),
  createdBy: z.string().describe("User ID"),
};

export async function createBillingSchedule(args: {
  clientId?: string; accountingFirmId?: string;
  agreementId: string; name: string; customerId: string;
  billingType: string; currency?: string;
  milestones?: z.infer<typeof milestoneSchema>[];
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.agreementId, "agr", "agreementId");
    validateTypeId(args.customerId, "cust", "customerId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Validate customer belongs to tenant
      const custTw = tenantWhere(tenant, 2);
      const custResult = await client.query(
        `SELECT name FROM customers WHERE id = $1 AND ${custTw.sql} AND is_active = true`,
        [args.customerId, ...custTw.params],
      );
      if (custResult.rows.length === 0) return errorResponse("Customer not found or does not belong to this tenant.");

      // Validate agreement belongs to tenant
      const agrTw = tenantWhere(tenant, 2);
      const agrResult = await client.query(
        `SELECT id FROM agreements WHERE id = $1 AND ${agrTw.sql} AND is_archived = false`,
        [args.agreementId, ...agrTw.params],
      );
      if (agrResult.rows.length === 0) return errorResponse("Agreement not found or does not belong to this tenant.");

      const totalValue = (args.milestones ?? []).reduce((s, m) => s + m.amount, 0);
      const scheduleId = generateId("bsch");

      await client.query(
        `INSERT INTO billing_schedules (
          id, agreement_id, name, status, total_value, total_billed, total_paid,
          currency, customer_id, customer_name, billing_type,
          client_id, accounting_firm_id, created_by, is_archived, created_at, updated_at
        ) VALUES ($1, $2, $3, 'draft', $4, 0, 0, $5, $6, $7, $8, $9, $10, $11, false, NOW(), NOW())`,
        [scheduleId, args.agreementId, args.name, totalValue.toFixed(2),
         args.currency ?? "MYR", args.customerId, custResult.rows[0].name, args.billingType,
         tenant.clientId, tenant.accountingFirmId, args.createdBy]);

      // Insert milestones
      if (args.milestones && args.milestones.length > 0) {
        for (let i = 0; i < args.milestones.length; i++) {
          const m = args.milestones[i];
          const msId = generateId("bsml");
          await client.query(
            `INSERT INTO billing_schedule_milestones (id, billing_schedule_id, name, amount, due_date, sort_order, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW(), NOW())`,
            [msId, scheduleId, m.name, m.amount.toFixed(2), m.dueDate, i + 1]);
        }
      }

      return successResponse({
        id: scheduleId, name: args.name, status: "draft",
        totalValue: parseFloat(totalValue.toFixed(2)),
        milestoneCount: args.milestones?.length ?? 0,
      });
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
