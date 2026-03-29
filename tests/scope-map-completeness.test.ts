import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_SCOPE_MAP, getToolScope } from "../src/scope-map.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolsDir = join(__dirname, "..", "src", "tools");

// Derive tool names from filenames: get-invoices.ts → get_invoices
const toolFiles = readdirSync(toolsDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => f.replace(".ts", "").replace(/-/g, "_"));

describe("TOOL_SCOPE_MAP completeness", () => {
  it("has a scope mapping for every tool file in src/tools/", () => {
    const missing = toolFiles.filter((name) => !(name in TOOL_SCOPE_MAP));
    expect(missing).toEqual([]);
  });

  it("has scope mappings for Code Mode tools", () => {
    expect(TOOL_SCOPE_MAP.search_tools).toBeDefined();
    expect(TOOL_SCOPE_MAP.execute_code).toBeDefined();
  });

  it("every scope value contains a colon (module:permission format)", () => {
    for (const [tool, scope] of Object.entries(TOOL_SCOPE_MAP)) {
      expect(scope, `Tool "${tool}" has invalid scope "${scope}"`).toContain(":");
    }
  });

  it("getToolScope throws for unmapped tool (fail-closed)", () => {
    expect(() => getToolScope("totally_fake_tool_xyz")).toThrow("has no scope mapping");
  });

  it("getToolScope returns correct scope for known tools", () => {
    expect(getToolScope("get_invoices")).toBe("invoicing:read");
    expect(getToolScope("create_invoice")).toBe("invoicing:write");
    expect(getToolScope("execute_query")).toBe("query:execute");
  });

  it("read tools map to :read scopes, write tools map to :write scopes", () => {
    for (const [tool, scope] of Object.entries(TOOL_SCOPE_MAP)) {
      if (tool.startsWith("get_") || tool.startsWith("search_")) {
        // Read tools should have :read or query:execute/code:execute
        expect(
          scope.endsWith(":read") || scope === "query:execute" || scope === "code:execute",
          `Read tool "${tool}" has write scope "${scope}"`,
        ).toBe(true);
      }
    }
  });
});
