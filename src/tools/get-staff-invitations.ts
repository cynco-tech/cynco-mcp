import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getStaffInvitationsSchema = {
  ...tenantSchema,
  status: z.enum(["pending", "accepted", "expired"]).optional().describe("Filter by status"),
};

export async function getStaffInvitations(args: {
  clientId?: string; accountingFirmId?: string; status?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const companyType = tenant.column === "client_id" ? "client" : "accounting_firm";
    const params: unknown[] = [tenant.value, companyType];
    let filters = "";
    if (args.status) { filters = ` AND si.status = $3`; params.push(args.status); }

    const result = await query(
      `SELECT si.id, si.email, si.position, si.status, si.expires_at,
              si.created_at, si.accepted_at,
              u.email AS invited_by_email
       FROM staff_invitations si
       LEFT JOIN users u ON u.id = si.invited_by
       WHERE si.company_id = $1 AND si.company_type = $2 ${filters}
       ORDER BY si.created_at DESC`, params);

    return successResponse({
      invitations: result.rows.map(r => ({
        id: r.id, email: r.email, position: r.position, status: r.status,
        expiresAt: r.expires_at, invitedByEmail: r.invited_by_email,
        createdAt: r.created_at, acceptedAt: r.accepted_at,
      })),
      invitationCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
