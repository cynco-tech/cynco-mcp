/**
 * CLI utility to generate MCP API keys.
 *
 * Usage:
 *   npx tsx src/cli/generate-key.ts \
 *     --name "My Agent" \
 *     --tenant-type client \
 *     --tenant-id client_01abc...
 *
 * Requires CYNCO_DATABASE_URL in environment.
 */

import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { generateApiKey, hashApiKey } from "../auth.js";
import { query, shutdown } from "../db.js";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    "tenant-type": { type: "string" },
    "tenant-id": { type: "string" },
    "created-by": { type: "string" },
    "expires-in-days": { type: "string" },
  },
});

async function main() {
  const name = values.name;
  const tenantType = values["tenant-type"];
  const tenantId = values["tenant-id"];
  const createdBy = values["created-by"];
  const expiresInDays = values["expires-in-days"]
    ? parseInt(values["expires-in-days"], 10)
    : null;

  if (!name || !tenantType || !tenantId) {
    console.error("Usage: npx tsx src/cli/generate-key.ts --name <name> --tenant-type <client|accounting_firm> --tenant-id <id>");
    console.error("");
    console.error("Options:");
    console.error("  --name            Human-readable label for the key");
    console.error("  --tenant-type     'client' or 'accounting_firm'");
    console.error("  --tenant-id       The client_id or accounting_firm_id");
    console.error("  --created-by      (optional) User ID who created this key");
    console.error("  --expires-in-days (optional) Number of days until expiration");
    process.exit(1);
  }

  if (tenantType !== "client" && tenantType !== "accounting_firm") {
    console.error("Error: --tenant-type must be 'client' or 'accounting_firm'");
    process.exit(1);
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const id = `mak_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  await query(
    `INSERT INTO mcp_api_keys (id, key_hash, key_prefix, name, tenant_type, tenant_id, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, keyHash, keyPrefix, name, tenantType, tenantId, createdBy, expiresAt],
  );

  console.log("");
  console.log("API key created successfully.");
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│  SAVE THIS KEY — it will not be shown again.               │");
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Key:     ${rawKey}`);
  console.log(`│  ID:      ${id}`);
  console.log(`│  Name:    ${name}`);
  console.log(`│  Tenant:  ${tenantType} → ${tenantId}`);
  if (expiresAt) {
    console.log(`│  Expires: ${expiresAt}`);
  }
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log("Add to your AI agent config:");
  console.log("");
  console.log(`  "headers": { "Authorization": "Bearer ${rawKey}" }`);
  console.log("");

  await shutdown();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
