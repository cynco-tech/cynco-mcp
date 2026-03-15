import { describe, it, expect } from "vitest";
import { resolveTenant, validateTypeId, tenantWhere } from "../src/utils/validation.js";

describe("resolveTenant", () => {
  it("resolves client tenant", () => {
    const tenant = resolveTenant({ clientId: "client_abc123" });
    expect(tenant.column).toBe("client_id");
    expect(tenant.value).toBe("client_abc123");
    expect(tenant.clientId).toBe("client_abc123");
    expect(tenant.accountingFirmId).toBeNull();
  });

  it("resolves accounting firm tenant", () => {
    const tenant = resolveTenant({ accountingFirmId: "accfirm_xyz789" });
    expect(tenant.column).toBe("accounting_firm_id");
    expect(tenant.value).toBe("accfirm_xyz789");
    expect(tenant.clientId).toBeNull();
    expect(tenant.accountingFirmId).toBe("accfirm_xyz789");
  });

  it("throws when both provided", () => {
    expect(() =>
      resolveTenant({ clientId: "client_abc", accountingFirmId: "accfirm_xyz" }),
    ).toThrow("Exactly one");
  });

  it("throws when neither provided", () => {
    expect(() => resolveTenant({})).toThrow("Exactly one");
  });

  it("throws on empty string clientId", () => {
    expect(() => resolveTenant({ clientId: "" })).toThrow("Exactly one");
  });

  it("throws on invalid TypeID prefix", () => {
    expect(() => resolveTenant({ clientId: "wrong_prefix" })).toThrow('expected format "client_..."');
  });
});

describe("validateTypeId", () => {
  it("accepts valid prefix", () => {
    expect(validateTypeId("client_abc", "client", "clientId")).toBe("client_abc");
  });

  it("rejects wrong prefix", () => {
    expect(() => validateTypeId("user_abc", "client", "clientId")).toThrow("Invalid clientId");
  });
});

describe("tenantWhere", () => {
  it("builds correct SQL for client", () => {
    const tenant = resolveTenant({ clientId: "client_abc" });
    const where = tenantWhere(tenant);
    expect(where.sql).toBe("client_id = $1");
    expect(where.params).toEqual(["client_abc"]);
    expect(where.nextParam).toBe(2);
  });

  it("builds correct SQL with alias", () => {
    const tenant = resolveTenant({ clientId: "client_abc" });
    const where = tenantWhere(tenant, 3, "je");
    expect(where.sql).toBe("je.client_id = $3");
    expect(where.params).toEqual(["client_abc"]);
    expect(where.nextParam).toBe(4);
  });
});
