/**
 * Error enrichment — append recovery suggestions to common MCP errors.
 * These help the AI agent self-correct without user intervention.
 */

const RECOVERY_HINTS: Record<string, string> = {
  "Customer not found": "Use `get_customers` to list valid customer IDs, or `create_customer` to create one.",
  "Vendor not found": "Use `get_vendors` to list valid vendor IDs, or `create_vendor` to create one.",
  "Invoice not found": "Use `get_invoices` to list valid invoice IDs.",
  "Account not found": "Use `search_accounts` to find valid account IDs.",
  "Chart of Accounts not found": "Use `get_chart_of_accounts` to list available COAs.",
  "User not found": "Ensure createdBy is a valid user ID with the `usr_` prefix.",
  "Tag not found": "Use `get_tags` to list valid tag IDs, or `create_tag` to create one.",
  "Agreement not found": "Use `get_agreements` to list valid agreement IDs.",
  "Bill not found": "Use `get_bills` to list valid bill IDs.",
  "Purchase order not found": "Use `get_purchase_orders` to list valid PO IDs.",
  "Quotation not found": "Use `get_quotations` to list valid quotation IDs.",
  "Asset not found": "Use `get_fixed_assets` to list valid asset IDs.",
  "File not found": "Use `get_dataroom_files` or `search_dataroom` to find valid file IDs.",
  "Folder not found": "Use `get_dataroom_folders` to list valid folder IDs.",
  "Cannot transition": "Check the tool description for valid status transitions.",
  "Insufficient permissions": "Check the API key's scopes. See the `cynco://guide/scopes` resource.",
  "No fields to update": "Provide at least one field to update.",
  "already exists": "The entity already exists. Use the corresponding update tool instead.",
  "Exactly one of clientId": "Provide either clientId OR accountingFirmId, not both.",
  "expected format": "Use the correct TypeID prefix (e.g., cust_ for customers, vend_ for vendors).",
};

/**
 * Enrich an error message with a recovery suggestion if one matches.
 */
export function enrichError(message: string): string {
  for (const [pattern, hint] of Object.entries(RECOVERY_HINTS)) {
    if (message.toLowerCase().includes(pattern.toLowerCase())) {
      return `${message}\n\nHint: ${hint}`;
    }
  }
  return message;
}
