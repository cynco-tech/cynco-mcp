import { describe, it, expect } from "vitest";
import { checkScope } from "../src/auth.js";
import type { ApiKeyRecord } from "../src/auth.js";
import { getToolScope, TOOL_SCOPE_MAP } from "../src/scope-map.js";

function makeRecord(scopes: string[]): ApiKeyRecord {
  return {
    id: "mak_test",
    tenantType: "client",
    tenantId: "client_abc",
    name: "Test Key",
    scopes,
  };
}

describe("Granular module-level scopes", () => {
  // ── Direct module scope matches ──

  it("allows accounting:read with accounting:read scope", () => {
    expect(checkScope(makeRecord(["accounting:read"]), "accounting:read")).toBe(true);
  });

  it("allows accounting:write with accounting:write scope", () => {
    expect(checkScope(makeRecord(["accounting:write"]), "accounting:write")).toBe(true);
  });

  it("denies accounting:write with accounting:read scope", () => {
    expect(checkScope(makeRecord(["accounting:read"]), "accounting:write")).toBe(false);
  });

  it("denies invoicing:read with accounting:read scope (cross-module)", () => {
    expect(checkScope(makeRecord(["accounting:read"]), "invoicing:read")).toBe(false);
  });

  // ── Module write implies module read ──

  it("allows accounting:read with accounting:write scope (write implies read)", () => {
    expect(checkScope(makeRecord(["accounting:write"]), "accounting:read")).toBe(true);
  });

  it("allows invoicing:read with invoicing:write scope", () => {
    expect(checkScope(makeRecord(["invoicing:write"]), "invoicing:read")).toBe(true);
  });

  it("allows customers:read with customers:write scope", () => {
    expect(checkScope(makeRecord(["customers:write"]), "customers:read")).toBe(true);
  });

  it("allows assets:read with assets:write scope", () => {
    expect(checkScope(makeRecord(["assets:write"]), "assets:read")).toBe(true);
  });

  // ── Legacy scope backwards compatibility ──

  it("legacy read grants any module:read", () => {
    const record = makeRecord(["read"]);
    expect(checkScope(record, "accounting:read")).toBe(true);
    expect(checkScope(record, "invoicing:read")).toBe(true);
    expect(checkScope(record, "customers:read")).toBe(true);
    expect(checkScope(record, "vendors:read")).toBe(true);
    expect(checkScope(record, "reports:read")).toBe(true);
    expect(checkScope(record, "agreements:read")).toBe(true);
    expect(checkScope(record, "dataroom:read")).toBe(true);
    expect(checkScope(record, "assets:read")).toBe(true);
    expect(checkScope(record, "admin:read")).toBe(true);
    expect(checkScope(record, "tags:read")).toBe(true);
  });

  it("legacy read does NOT grant module:write", () => {
    const record = makeRecord(["read"]);
    expect(checkScope(record, "accounting:write")).toBe(false);
    expect(checkScope(record, "invoicing:write")).toBe(false);
    expect(checkScope(record, "customers:write")).toBe(false);
  });

  it("legacy write grants any module:read and module:write", () => {
    const record = makeRecord(["write"]);
    expect(checkScope(record, "accounting:read")).toBe(true);
    expect(checkScope(record, "accounting:write")).toBe(true);
    expect(checkScope(record, "invoicing:read")).toBe(true);
    expect(checkScope(record, "invoicing:write")).toBe(true);
    expect(checkScope(record, "customers:write")).toBe(true);
    expect(checkScope(record, "vendors:write")).toBe(true);
  });

  it("legacy write does NOT grant query:execute", () => {
    expect(checkScope(makeRecord(["write"]), "query:execute")).toBe(false);
  });

  // ── query:execute remains explicit ──

  it("query:execute requires explicit scope", () => {
    expect(checkScope(makeRecord(["query:execute"]), "query:execute")).toBe(true);
    expect(checkScope(makeRecord(["accounting:write"]), "query:execute")).toBe(false);
    expect(checkScope(makeRecord(["admin:read"]), "query:execute")).toBe(false);
  });

  // ── Empty scopes = full access (unchanged) ──

  it("empty scopes grants everything (backwards compat)", () => {
    const record = makeRecord([]);
    expect(checkScope(record, "accounting:read")).toBe(true);
    expect(checkScope(record, "accounting:write")).toBe(true);
    expect(checkScope(record, "query:execute")).toBe(true);
    expect(checkScope(record, "read")).toBe(true);
    expect(checkScope(record, "write")).toBe(true);
  });

  // ── Multiple specific scopes ──

  it("allows multiple specific module scopes", () => {
    const record = makeRecord(["customers:read", "invoicing:write"]);
    expect(checkScope(record, "customers:read")).toBe(true);
    expect(checkScope(record, "invoicing:read")).toBe(true);  // write implies read
    expect(checkScope(record, "invoicing:write")).toBe(true);
    expect(checkScope(record, "accounting:read")).toBe(false); // not granted
    expect(checkScope(record, "customers:write")).toBe(false); // only read granted
  });

  it("mixed legacy and module scopes work together", () => {
    const record = makeRecord(["read", "invoicing:write"]);
    expect(checkScope(record, "accounting:read")).toBe(true);   // legacy read
    expect(checkScope(record, "invoicing:write")).toBe(true);   // direct
    expect(checkScope(record, "accounting:write")).toBe(false);  // legacy read doesn't grant write
  });
});

describe("TOOL_SCOPE_MAP", () => {
  it("maps every tool name to a scope", () => {
    const toolNames = Object.keys(TOOL_SCOPE_MAP);
    expect(toolNames.length).toBeGreaterThan(80);

    for (const [tool, scope] of Object.entries(TOOL_SCOPE_MAP)) {
      expect(typeof scope).toBe("string");
      expect(scope.length).toBeGreaterThan(0);
      // All scopes should contain a colon (module:permission)
      expect(scope).toContain(":");
    }
  });

  it("getToolScope falls back to 'read' for unknown tools", () => {
    expect(getToolScope("nonexistent_tool")).toBe("read");
  });

  it("maps accounting tools correctly", () => {
    expect(TOOL_SCOPE_MAP.get_chart_of_accounts).toBe("accounting:read");
    expect(TOOL_SCOPE_MAP.create_journal_entries).toBe("accounting:write");
    expect(TOOL_SCOPE_MAP.get_general_ledger).toBe("accounting:read");
  });

  it("maps customer tools correctly", () => {
    expect(TOOL_SCOPE_MAP.get_customers).toBe("customers:read");
    expect(TOOL_SCOPE_MAP.create_customer).toBe("customers:write");
    expect(TOOL_SCOPE_MAP.delete_customer).toBe("customers:write");
  });

  it("maps code mode tools to query:execute", () => {
    expect(TOOL_SCOPE_MAP.search_schema).toBe("query:execute");
    expect(TOOL_SCOPE_MAP.execute_query).toBe("query:execute");
  });

  it("maps all Phase 4 module tools", () => {
    expect(TOOL_SCOPE_MAP.get_agreements).toBe("agreements:read");
    expect(TOOL_SCOPE_MAP.create_agreement).toBe("agreements:write");
    expect(TOOL_SCOPE_MAP.get_dataroom_files).toBe("dataroom:read");
    expect(TOOL_SCOPE_MAP.create_dataroom_folder).toBe("dataroom:write");
    expect(TOOL_SCOPE_MAP.get_fixed_assets).toBe("assets:read");
    expect(TOOL_SCOPE_MAP.create_fixed_asset).toBe("assets:write");
    expect(TOOL_SCOPE_MAP.get_team_members).toBe("admin:read");
    expect(TOOL_SCOPE_MAP.get_audit_trail).toBe("admin:read");
    expect(TOOL_SCOPE_MAP.get_einvoice_status).toBe("admin:read");
  });

  it("maps tag tools correctly", () => {
    expect(TOOL_SCOPE_MAP.get_tags).toBe("tags:read");
    expect(TOOL_SCOPE_MAP.create_tag).toBe("tags:write");
    expect(TOOL_SCOPE_MAP.assign_tag).toBe("tags:write");
  });
});
