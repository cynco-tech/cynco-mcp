import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { enrichError } from "./errors.js";

export interface TenantArgs {
  clientId?: string;
  accountingFirmId?: string;
}

export interface Tenant {
  column: "client_id" | "accounting_firm_id";
  value: string;
  clientId: string | null;
  accountingFirmId: string | null;
}

/**
 * Validate that an ID starts with the expected TypeID prefix.
 * Returns the ID if valid, throws a descriptive error if not.
 */
export function validateTypeId(value: string, prefix: string, fieldName: string): string {
  if (!value.startsWith(`${prefix}_`)) {
    throw new Error(
      `Invalid ${fieldName}: "${value}" — expected format "${prefix}_..." (e.g. "${prefix}_abc123").`,
    );
  }
  return value;
}

/**
 * Validate and resolve tenant from XOR args.
 * Returns the resolved column/value for use in queries.
 */
export function resolveTenant(args: TenantArgs): Tenant {
  const hasClient = args.clientId != null && args.clientId.length > 0;
  const hasFirm =
    args.accountingFirmId != null && args.accountingFirmId.length > 0;

  if (hasClient === hasFirm) {
    throw new Error(
      "Exactly one of clientId or accountingFirmId must be provided (XOR).",
    );
  }

  if (hasClient) {
    validateTypeId(args.clientId!, "client", "clientId");
    return {
      column: "client_id",
      value: args.clientId!,
      clientId: args.clientId!,
      accountingFirmId: null,
    };
  }
  validateTypeId(args.accountingFirmId!, "accfirm", "accountingFirmId");
  return {
    column: "accounting_firm_id",
    value: args.accountingFirmId!,
    clientId: null,
    accountingFirmId: args.accountingFirmId!,
  };
}

/**
 * Build a parameterized WHERE clause for tenant filtering.
 *
 * @param tenant - resolved tenant from resolveTenant()
 * @param startParam - the $N index to use (default 1)
 * @param alias - optional table alias (e.g. "cr", "ab")
 * @returns { sql, params, nextParam }
 */
export function tenantWhere(
  tenant: Tenant,
  startParam = 1,
  alias?: string,
): { sql: string; params: unknown[]; nextParam: number } {
  const col = alias ? `${alias}.${tenant.column}` : tenant.column;
  return {
    sql: `${col} = $${startParam}`,
    params: [tenant.value],
    nextParam: startParam + 1,
  };
}

const MAX_SUCCESS_RESPONSE_CHARS = 100_000; // ~25K tokens — prevents multi-MB responses

export function successResponse(data: unknown): CallToolResult {
  const payload = { success: true, data };
  const text = JSON.stringify(payload);

  if (text.length > MAX_SUCCESS_RESPONSE_CHARS) {
    // Return a valid JSON summary without the oversized data — avoids broken
    // JSON from mid-string slicing and doesn't hold the full payload in memory
    const summaryPayload = {
      success: true,
      _truncated: true,
      _originalSizeChars: text.length,
      _hint: "Response exceeded size limit. Use tighter filters, lower limit, or specific ID lookups to reduce response size.",
    };
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(summaryPayload),
          annotations: { audience: ["user", "assistant"] as const },
        },
      ],
    } as CallToolResult;
  }

  return {
    content: [
      {
        type: "text",
        text,
        annotations: { audience: ["user", "assistant"] as const },
      },
    ],
  } as CallToolResult;
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * Build an error tool response.
 * In production, DB errors and stack traces are masked — only the correlation
 * ID is returned so operators can look up the full error in server logs.
 */
export function errorResponse(
  message: string,
  details?: unknown,
  requestId?: string,
): CallToolResult {
  const safeMessage =
    isProduction && !isUserFacingError(message)
      ? `Internal error${requestId ? ` (ref: ${requestId})` : ""}. Contact support if this persists.`
      : enrichError(message);

  const body: Record<string, unknown> = { success: false, error: safeMessage };
  if (!isProduction && details) body.details = details;
  if (requestId) body.requestId = requestId;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(body),
        annotations: { audience: ["assistant"] as const },
      },
    ],
    isError: true,
  } as CallToolResult;
}

/**
 * Whitelist approach: only known user-facing error messages pass through in production.
 * Everything else is masked. This is safer than blacklisting internal patterns because
 * new Postgres error categories are automatically masked instead of leaking.
 */
function isUserFacingError(message: string): boolean {
  const patterns = [
    /^Exactly one of/,
    /not found/i,
    /already exists/i,
    /already inactive/i,
    /already assigned/i,
    /Cannot transition/i,
    /Cannot deactivate/i,
    /Cannot close period/i,
    /Cannot record payment/i,
    /Invalid.*format/i,
    /Invalid status transition/i,
    /Invalid amount/i,
    /must be/i,
    /must reference/i,
    /must include/i,
    /must start with/i,
    /must appear/i,
    /Insufficient permissions/i,
    /No fields to update/i,
    /is closed/i,
    /is inactive/i,
    /is a header account/i,
    /is unbalanced/i,
    /does not belong/i,
    /do not belong/i,
    /Forbidden SQL/i,
    /\$TENANT_FILTER/,
    /Only SELECT/i,
    /not available in the sandbox/i,
    /Tool call limit/i,
    /Script too long/i,
    /Script timed out/i,
    /Payment of .* exceeds/i,
    /No account balances/i,
    /draft journal entries remain/i,
    /Unsupported entity type/i,
  ];
  return patterns.some((p) => p.test(message));
}
