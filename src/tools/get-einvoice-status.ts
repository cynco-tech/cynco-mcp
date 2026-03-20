import { z } from "zod";
import { query } from "../db.js";
import { resolveTenant, tenantWhere, successResponse, errorResponse } from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const getEinvoiceStatusSchema = {
  ...tenantSchema,
};

export async function getEinvoiceStatus(args: {
  clientId?: string; accountingFirmId?: string;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1);

    const result = await query(
      `SELECT id, tin_number, brn_number, is_active, last_submission_at,
              total_submissions, total_accepted, total_rejected,
              created_at, updated_at
       FROM einvoice_credentials
       WHERE ${tw.sql}
       LIMIT 1`, tw.params);

    if (result.rows.length === 0) {
      return successResponse({
        configured: false,
        message: "E-invoice credentials not configured for this tenant.",
      });
    }

    const r = result.rows[0];
    return successResponse({
      configured: true,
      isActive: r.is_active,
      tinNumber: r.tin_number ? `${(r.tin_number as string).slice(0, 4)}****` : null, // Masked
      brnNumber: r.brn_number ? `${(r.brn_number as string).slice(0, 4)}****` : null, // Masked
      lastSubmissionAt: r.last_submission_at,
      totalSubmissions: r.total_submissions,
      totalAccepted: r.total_accepted,
      totalRejected: r.total_rejected,
      configuredAt: r.created_at,
    });
  } catch (error) { return errorResponse(error instanceof Error ? error.message : "Unknown error"); }
}
