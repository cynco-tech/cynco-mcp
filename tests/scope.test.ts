import { describe, it, expect } from "vitest";
import { checkScope } from "../src/auth.js";
import type { ApiKeyRecord } from "../src/auth.js";

function makeRecord(scopes: string[]): ApiKeyRecord {
  return {
    id: "mak_test",
    tenantType: "client",
    tenantId: "client_abc",
    name: "Test Key",
    scopes,
  };
}

describe("checkScope", () => {
  // ── Empty scopes = unrestricted (backwards compat) ──

  it("allows read with empty scopes", () => {
    expect(checkScope(makeRecord([]), "read")).toBe(true);
  });

  it("allows write with empty scopes", () => {
    expect(checkScope(makeRecord([]), "write")).toBe(true);
  });

  it("allows query:execute with empty scopes", () => {
    expect(checkScope(makeRecord([]), "query:execute")).toBe(true);
  });

  // ── Read scope ──

  it("allows read with read scope", () => {
    expect(checkScope(makeRecord(["read"]), "read")).toBe(true);
  });

  it("allows read with write scope (write implies read)", () => {
    expect(checkScope(makeRecord(["write"]), "read")).toBe(true);
  });

  it("denies write with read-only scope", () => {
    expect(checkScope(makeRecord(["read"]), "write")).toBe(false);
  });

  it("denies query:execute with read-only scope", () => {
    expect(checkScope(makeRecord(["read"]), "query:execute")).toBe(false);
  });

  // ── Write scope ──

  it("allows write with write scope", () => {
    expect(checkScope(makeRecord(["write"]), "write")).toBe(true);
  });

  it("denies query:execute with write-only scope (query:execute is explicit opt-in)", () => {
    expect(checkScope(makeRecord(["write"]), "query:execute")).toBe(false);
  });

  // ── Explicit query:execute scope ──

  it("allows query:execute with explicit scope", () => {
    expect(checkScope(makeRecord(["read", "query:execute"]), "query:execute")).toBe(true);
  });

  it("denies write with query:execute scope only", () => {
    expect(checkScope(makeRecord(["query:execute"]), "write")).toBe(false);
  });

  // ── Combined scopes ──

  it("allows read with read+query:execute scopes", () => {
    expect(checkScope(makeRecord(["read", "query:execute"]), "read")).toBe(true);
  });

  it("write scope grants read+write but not query:execute", () => {
    const record = makeRecord(["write"]);
    expect(checkScope(record, "read")).toBe(true);
    expect(checkScope(record, "write")).toBe(true);
    expect(checkScope(record, "query:execute")).toBe(false);
  });

  it("allows all with write+query:execute scopes", () => {
    const record = makeRecord(["write", "query:execute"]);
    expect(checkScope(record, "read")).toBe(true);
    expect(checkScope(record, "write")).toBe(true);
    expect(checkScope(record, "query:execute")).toBe(true);
  });
});
