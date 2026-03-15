import { z } from "zod";
import { query } from "../db.js";
import {
  resolveTenant,
  tenantWhere,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

export const getJournalEntryTemplatesSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  includeInactive: z.boolean().optional().default(false).describe("Include inactive templates"),
  recurringOnly: z.boolean().optional().default(false).describe("Only return recurring templates"),
};

export async function getJournalEntryTemplates(args: {
  clientId?: string;
  accountingFirmId?: string;
  includeInactive?: boolean;
  recurringOnly?: boolean;
}) {
  try {
    const tenant = resolveTenant(args);
    const tw = tenantWhere(tenant, 1, "jet");

    let filters = "";
    if (!args.includeInactive) {
      filters += ` AND jet.is_active = true`;
    }
    if (args.recurringOnly) {
      filters += ` AND jet.is_recurring = true`;
    }

    const result = await query(
      `SELECT
          jet.id,
          jet.name,
          jet.description,
          jet.coa_id,
          jet.lines,
          jet.is_recurring,
          jet.recurrence_pattern,
          jet.next_occurrence,
          jet.last_created,
          jet.is_active,
          jet.source,
          jet.created_by,
          jet.created_at
       FROM journal_entry_templates jet
       WHERE ${tw.sql} ${filters}
       ORDER BY jet.name`,
      tw.params,
    );

    const templates = result.rows.map((r) => {
      const lines = r.lines as Array<{
        accountId: string;
        accountCode: string;
        accountName: string;
        debitAmount: number;
        creditAmount: number;
        description: string | null;
      }>;
      const totalAmount = lines.reduce((sum, l) => sum + (l.debitAmount || 0), 0);

      return {
        id: r.id,
        name: r.name,
        description: r.description,
        coaId: r.coa_id,
        lineCount: lines.length,
        totalAmount: totalAmount.toFixed(2),
        lines,
        isRecurring: r.is_recurring,
        recurrencePattern: r.recurrence_pattern,
        nextOccurrence: r.next_occurrence,
        lastCreated: r.last_created,
        isActive: r.is_active,
        source: r.source,
        createdBy: r.created_by,
        createdAt: r.created_at,
      };
    });

    return successResponse({
      templates,
      templateCount: templates.length,
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
