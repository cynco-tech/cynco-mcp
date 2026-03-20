import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getOrganizationLinkRequestsSchema = {
  ...tenantSchema,
  status: z.enum(["pending", "accepted", "rejected", "expired"]).optional().describe("Filter by status"),
};

export async function getOrganizationLinkRequests(args: {
  clientId?: string; accountingFirmId?: string; status?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const orgType = tenant.column === "client_id" ? "client" : "accounting_firm";
    const params: unknown[] = [tenant.value, orgType];
    let filters = "";
    if (args.status) { filters = ` AND olr.status = $3`; params.push(args.status); }

    const result = await query(
      `SELECT olr.id, olr.target_user_email, olr.role_if_accepted, olr.position,
              olr.status, olr.created_at, olr.responded_at, olr.expires_at
       FROM organization_link_requests olr
       WHERE olr.requesting_org_id = $1 AND olr.requesting_org_type = $2 ${filters}
       ORDER BY olr.created_at DESC`, params);

    return successResponse({
      requests: result.rows.map(r => ({
        id: r.id, targetEmail: r.target_user_email,
        roleIfAccepted: r.role_if_accepted, position: r.position,
        status: r.status, createdAt: r.created_at,
        respondedAt: r.responded_at, expiresAt: r.expires_at,
      })),
      requestCount: result.rows.length,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
