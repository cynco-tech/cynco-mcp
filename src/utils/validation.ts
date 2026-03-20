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

export function successResponse(data: unknown): CallToolResult {
  const payload = { success: true, data };
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload),
        annotations: { audience: ["user", "assistant"] as const },
      },
    ],
    structuredContent: payload,
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
    isProduction && isInternalError(message)
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
    structuredContent: body,
    isError: true,
  } as CallToolResult;
}

/**
 * Heuristic: errors that likely contain internal details (DB messages, stack traces).
 * User-facing validation errors (e.g. "Exactly one of clientId...") pass through.
 */
function isInternalError(message: string): boolean {
  const patterns = [
    /relation ".*" does not exist/i,
    /column ".*" does not exist/i,
    /syntax error at or near/i,
    /connection refused/i,
    /timeout expired/i,
    /ECONNREFUSED/,
    /duplicate key value/i,
    /violates.*constraint/i,
    /stack:/i,
    /at\s+\S+\s+\(.*:\d+:\d+\)/,
  ];
  return patterns.some((p) => p.test(message));
}
