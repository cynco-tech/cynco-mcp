import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getTeamMembersSchema = {
  ...tenantSchema,
};

export async function getTeamMembers(args: {
  clientId?: string; accountingFirmId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    // Users are linked via client_users or accounting_firm_users junction tables
    const table = tenant.column === "client_id" ? "client_users" : "accounting_firm_users";
    const fkCol = tenant.column;

    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, cu.role, cu.position,
              cu.status, cu.created_at
       FROM ${table} cu
       JOIN users u ON u.id = cu.user_id
       WHERE cu.${fkCol} = $1
       ORDER BY u.first_name, u.last_name`,
      [tenant.value]);

    return successResponse({
      members: result.rows.map(r => ({
        id: r.id, email: r.email,
        firstName: r.first_name, lastName: r.last_name,
        role: r.role, position: r.position,
        status: r.status, joinedAt: r.created_at,
      })),
      memberCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
