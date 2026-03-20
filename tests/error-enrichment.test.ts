import { describe, it, expect } from "vitest";
import { enrichError } from "../src/utils/errors.js";

describe("enrichError", () => {
  // ── Entity not found errors ──

  it("enriches 'Customer not found' with hint", () => {
    const result = enrichError("Customer not found or does not belong to this tenant.");
    expect(result).toContain("Customer not found");
    expect(result).toContain("Hint:");
    expect(result).toContain("get_customers");
  });

  it("enriches 'Vendor not found' with hint", () => {
    const result = enrichError("Vendor not found or does not belong to this tenant.");
    expect(result).toContain("Hint:");
    expect(result).toContain("get_vendors");
  });

  it("enriches 'Account not found' with hint", () => {
    const result = enrichError("Account not found in this COA.");
    expect(result).toContain("search_accounts");
  });

  it("enriches 'Tag not found' with hint", () => {
    const result = enrichError("Tag not found or does not belong to this tenant.");
    expect(result).toContain("get_tags");
  });

  it("enriches 'Agreement not found' with hint", () => {
    const result = enrichError("Agreement not found or does not belong to this tenant.");
    expect(result).toContain("get_agreements");
  });

  it("enriches 'Asset not found' with hint", () => {
    const result = enrichError("Asset not found or does not belong to this tenant.");
    expect(result).toContain("get_fixed_assets");
  });

  // ── Transition errors ──

  it("enriches status transition errors", () => {
    const result = enrichError('Cannot transition from "draft" to "paid". Allowed: finalized.');
    expect(result).toContain("Hint:");
    expect(result).toContain("valid status transitions");
  });

  // ── Permission errors ──

  it("enriches insufficient permissions", () => {
    const result = enrichError('Insufficient permissions: this API key requires "accounting:write" scope.');
    expect(result).toContain("scopes");
  });

  // ── Validation errors ──

  it("enriches XOR tenant validation", () => {
    const result = enrichError("Exactly one of clientId or accountingFirmId must be provided (XOR).");
    expect(result).toContain("Hint:");
    expect(result).toContain("either clientId OR accountingFirmId");
  });

  it("enriches TypeID format errors", () => {
    const result = enrichError('Invalid customerId: "wrong_prefix" — expected format "cust_..."');
    expect(result).toContain("Hint:");
    expect(result).toContain("TypeID prefix");
  });

  it("enriches 'already exists' errors", () => {
    const result = enrichError('A customer with email "test@example.com" already exists.');
    expect(result).toContain("update tool");
  });

  it("enriches 'No fields to update' errors", () => {
    const result = enrichError("No fields to update.");
    expect(result).toContain("at least one field");
  });

  // ── User not found ──

  it("enriches 'User not found' with createdBy hint", () => {
    const result = enrichError("User not found: usr_invalid123");
    expect(result).toContain("usr_");
  });

  // ── Passthrough for unknown errors ──

  it("passes through unrecognized errors without hint", () => {
    const msg = "Some random unexpected error occurred.";
    expect(enrichError(msg)).toBe(msg);
  });

  it("passes through empty string", () => {
    expect(enrichError("")).toBe("");
  });

  // ── Case insensitivity ──

  it("matches case-insensitively", () => {
    const result = enrichError("CUSTOMER NOT FOUND in database");
    expect(result).toContain("Hint:");
  });
});
