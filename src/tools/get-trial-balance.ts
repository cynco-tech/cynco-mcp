import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getTrialBalanceSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  period: z.string().optional().describe("Filter by period (YYYY-MM)"),
  balanceType: z
    .enum(["preliminary", "adjusted", "final"])
    .optional()
    .describe("Filter by balance type"),
  limit: z.number().min(1).max(50).optional().default(10).describe("Max snapshots to return (max 50)"),
  offset: z.number().optional().default(0).describe("Pagination offset"),
};

export async function getTrialBalance(args: {
  clientId?: string;
  accountingFirmId?: string;
  period?: string;
  balanceType?: "preliminary" | "adjusted" | "final";
  limit?: number;
  offset?: number;
}) {
  try {
    const tenant = resolveTenant(args);

    // trial_balance scopes via coa_id → chart_of_accounts.client_id
    const tw = tenantWhere(tenant, 1, "coa");

    const params: unknown[] = [...tw.params];
    let nextParam = tw.nextParam;
    let filters = "";

    if (args.period) {
      filters += ` AND tb.period = $${nextParam}`;
      params.push(args.period);
      nextParam++;
    }

    if (args.balanceType) {
      filters += ` AND tb.balance_type = $${nextParam}`;
      params.push(args.balanceType);
      nextParam++;
    }

    const limit = Math.min(args.limit ?? 10, 50);
    const offset = args.offset ?? 0;

    const countResult = await query(
      `SELECT COUNT(*) AS total
       FROM trial_balance tb
       JOIN chart_of_accounts coa ON tb.coa_id = coa.id
       WHERE ${tw.sql} ${filters}`,
      params,
    );

    const totalSnapshots = parseInt((countResult.rows[0]?.total as string) ?? "0", 10);

    const dataParams = [...params, limit, offset];

    const result = await query(
      `SELECT tb.id, tb.coa_id, tb.period, tb.as_of_date, tb.balance_type,
              tb.total_debit, tb.total_credit, tb.is_balanced, tb.difference,
              tb.account_count, tb.balance_details,
              tb.generated_by, tb.generated_at,
              tb.approved_by, tb.approved_at, tb.created_at
       FROM trial_balance tb
       JOIN chart_of_accounts coa ON tb.coa_id = coa.id
       WHERE ${tw.sql} ${filters}
       ORDER BY tb.period DESC, tb.created_at DESC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      dataParams,
    );

    return successResponse({
      snapshots: result.rows.map((r) => ({
        id: r.id,
        coaId: r.coa_id,
        period: r.period,
        asOfDate: r.as_of_date,
        balanceType: r.balance_type,
        totalDebit: r.total_debit,
        totalCredit: r.total_credit,
        isBalanced: r.is_balanced,
        difference: r.difference,
        accountCount: r.account_count,
        balanceDetails: r.balance_details,
        generatedBy: r.generated_by,
        generatedAt: r.generated_at,
        approvedBy: r.approved_by,
        approvedAt: r.approved_at,
        createdAt: r.created_at,
      })),
      totalSnapshots,
      limit,
      offset,
      hasMore: totalSnapshots > offset + result.rows.length,
      ...(totalSnapshots > offset + result.rows.length
        ? { nextOffset: offset + result.rows.length }
        : {}),
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
