import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    seedTestData,
    cleanupTestData,
    shutdownTestDb,
    TEST_CLIENT_ID,
    TEST_USER_ID,
    TEST_COA_ID,
} from "./setup.js";

// ── Tool imports ─────────────────────────────────────────────────
import { createCustomer } from "../../src/tools/create-customer.js";
import { getCustomers } from "../../src/tools/get-customers.js";
import { updateCustomer } from "../../src/tools/update-customer.js";
import { deleteCustomer } from "../../src/tools/delete-customer.js";

import { createVendor } from "../../src/tools/create-vendor.js";
import { getVendors } from "../../src/tools/get-vendors.js";
import { updateVendor } from "../../src/tools/update-vendor.js";
import { deleteVendor } from "../../src/tools/delete-vendor.js";

import { getItems } from "../../src/tools/get-items.js";
import { createItem } from "../../src/tools/create-item.js";
import { updateItem } from "../../src/tools/update-item.js";
import { deleteItem } from "../../src/tools/delete-item.js";

import { createTag } from "../../src/tools/create-tag.js";
import { getTags } from "../../src/tools/get-tags.js";
import { updateTag } from "../../src/tools/update-tag.js";
import { deleteTag } from "../../src/tools/delete-tag.js";
import { assignTag } from "../../src/tools/assign-tag.js";

import { createAccount } from "../../src/tools/create-account.js";
import { updateAccount } from "../../src/tools/update-account.js";

import { createInvoice } from "../../src/tools/create-invoice.js";
import { updateInvoiceStatus } from "../../src/tools/update-invoice-status.js";
import { createQuotation } from "../../src/tools/create-quotation.js";
import { updateQuotationStatus } from "../../src/tools/update-quotation-status.js";
import { createBill } from "../../src/tools/create-bill.js";
import { updateBillStatus } from "../../src/tools/update-bill-status.js";
import { createPurchaseOrder } from "../../src/tools/create-purchase-order.js";
import { updatePurchaseOrderStatus } from "../../src/tools/update-purchase-order-status.js";

// ── Helpers ──────────────────────────────────────────────────────

function parseResult(result: { content: Array<{ text?: string }> }) {
    const text = result.content[0]?.text;
    if (!text) throw new Error("No content in result");
    return JSON.parse(text);
}

afterAll(async () => {
    await shutdownTestDb();
});

// ── Customer CRUD Chain ──────────────────────────────────────────

describe("Integration: Customer CRUD chain", () => {
    let customerId: string;

    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a customer", async () => {
        const result = await createCustomer({
            clientId: TEST_CLIENT_ID,
            name: "Acme Corp",
            email: "acme@example.com",
            phone: "+60123456789",
            paymentTerms: "Net 30",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.name).toBe("Acme Corp");
        expect(data.data.email).toBe("acme@example.com");
        expect(data.data.isActive).toBe(true);
        expect(data.data.id).toMatch(/^cust_/);
        customerId = data.data.id;
    });

    it("lists the customer", async () => {
        const result = await getCustomers({ clientId: TEST_CLIENT_ID });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        const found = data.data.customers.find((c: Record<string, unknown>) => c.id === customerId);
        expect(found).toBeDefined();
        expect(found.name).toBe("Acme Corp");
    });

    it("searches the customer by name", async () => {
        const result = await getCustomers({ clientId: TEST_CLIENT_ID, search: "Acme" });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.customers.length).toBeGreaterThanOrEqual(1);
    });

    it("updates the customer", async () => {
        const result = await updateCustomer({
            clientId: TEST_CLIENT_ID,
            customerId,
            name: "Acme Corporation",
            phone: "+60198765432",
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.before.name).toBe("Acme Corp");
        expect(data.data.after.name).toBe("Acme Corporation");
    });

    it("rejects duplicate email", async () => {
        const result = await createCustomer({
            clientId: TEST_CLIENT_ID,
            name: "Duplicate Co",
            email: "acme@example.com",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("already exists");
    });

    it("soft-deletes the customer", async () => {
        const result = await deleteCustomer({
            clientId: TEST_CLIENT_ID,
            customerId,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.isActive).toBe(false);
    });

    it("customer no longer appears in active list", async () => {
        const result = await getCustomers({ clientId: TEST_CLIENT_ID });
        const data = parseResult(result);
        const found = data.data.customers.find((c: Record<string, unknown>) => c.id === customerId);
        expect(found).toBeUndefined();
    });

    it("rejects double deactivation", async () => {
        const result = await deleteCustomer({
            clientId: TEST_CLIENT_ID,
            customerId,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("already inactive");
    });
});

// ── Vendor CRUD Chain ────────────────────────────────────────────

describe("Integration: Vendor CRUD chain", () => {
    let vendorId: string;

    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a vendor", async () => {
        const result = await createVendor({
            clientId: TEST_CLIENT_ID,
            name: "Office Supplies Ltd",
            email: "supplier@example.com",
            category: "Supplier",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.id).toMatch(/^vend_/);
        vendorId = data.data.id;
    });

    it("lists the vendor", async () => {
        const result = await getVendors({ clientId: TEST_CLIENT_ID });
        const data = parseResult(result);
        const found = data.data.vendors.find((v: Record<string, unknown>) => v.id === vendorId);
        expect(found).toBeDefined();
    });

    it("updates the vendor", async () => {
        const result = await updateVendor({
            clientId: TEST_CLIENT_ID,
            vendorId,
            name: "Office Supplies Sdn Bhd",
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.after.name).toBe("Office Supplies Sdn Bhd");
    });

    it("soft-deletes the vendor", async () => {
        const result = await deleteVendor({ clientId: TEST_CLIENT_ID, vendorId });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.isActive).toBe(false);
    });
});

// ── Items CRUD Chain ─────────────────────────────────────────────

describe("Integration: Items CRUD chain", () => {
    let itemId: string;

    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates an item", async () => {
        const result = await createItem({
            clientId: TEST_CLIENT_ID,
            name: "Consulting Service",
            unitPrice: 500,
            taxRate: 6,
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.id).toMatch(/^item_/);
        itemId = data.data.id;
    });

    it("lists items", async () => {
        const result = await getItems({ clientId: TEST_CLIENT_ID });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        const found = data.data.items.find((i: Record<string, unknown>) => i.id === itemId);
        expect(found).toBeDefined();
        expect(found.name).toBe("Consulting Service");
    });

    it("updates the item price", async () => {
        const result = await updateItem({
            clientId: TEST_CLIENT_ID,
            itemId,
            unitPrice: 600,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
    });

    it("deletes the item", async () => {
        const result = await deleteItem({ clientId: TEST_CLIENT_ID, itemId });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.deleted).toBe(true);
    });

    it("item no longer appears in list", async () => {
        const result = await getItems({ clientId: TEST_CLIENT_ID, search: "Consulting Service" });
        const data = parseResult(result);
        expect(data.data.items.length).toBe(0);
    });
});

// ── Tags CRUD + Assign Chain ─────────────────────────────────────

describe("Integration: Tags CRUD and assign chain", () => {
    let tagId: string;
    let customerId: string;

    beforeAll(async () => {
        await seedTestData();
        // Create a customer to tag
        const custResult = await createCustomer({
            clientId: TEST_CLIENT_ID,
            name: "Tag Target Customer",
            email: "tagtarget@example.com",
            createdBy: TEST_USER_ID,
        });
        customerId = parseResult(custResult).data.id;
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a tag", async () => {
        const result = await createTag({
            clientId: TEST_CLIENT_ID,
            name: "VIP",
            color: "#FF5733",
            description: "Very important customer",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.id).toMatch(/^tag_/);
        tagId = data.data.id;
    });

    it("rejects duplicate tag name", async () => {
        const result = await createTag({
            clientId: TEST_CLIENT_ID,
            name: "VIP",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("already exists");
    });

    it("lists tags", async () => {
        const result = await getTags({ clientId: TEST_CLIENT_ID });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        const found = data.data.tags.find((t: Record<string, unknown>) => t.id === tagId);
        expect(found).toBeDefined();
    });

    it("assigns tag to customer", async () => {
        const result = await assignTag({
            clientId: TEST_CLIENT_ID,
            tagId,
            entityId: customerId,
            entityType: "customer",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.tagName).toBe("VIP");
    });

    it("rejects duplicate tag assignment", async () => {
        const result = await assignTag({
            clientId: TEST_CLIENT_ID,
            tagId,
            entityId: customerId,
            entityType: "customer",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("already assigned");
    });

    it("updates the tag", async () => {
        const result = await updateTag({
            clientId: TEST_CLIENT_ID,
            tagId,
            name: "Premium",
            color: "#00FF00",
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.previousName).toBe("VIP");
        expect(data.data.name).toBe("Premium");
    });

    it("deletes the tag (cascades to assignments)", async () => {
        const result = await deleteTag({ clientId: TEST_CLIENT_ID, tagId });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.deleted).toBe(true);
    });
});

// ── COA Account Create/Update ────────────────────────────────────

describe("Integration: COA Account create/update", () => {
    let accountId: string;

    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a new account", async () => {
        const result = await createAccount({
            clientId: TEST_CLIENT_ID,
            coaId: TEST_COA_ID,
            accountCode: "5100",
            accountName: "Office Expenses",
            accountType: "expense",
            normalBalance: "debit",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.id).toMatch(/^acc_/);
        expect(data.data.accountCode).toBe("5100");
        expect(data.data.level).toBe(1);
        accountId = data.data.id;
    });

    it("rejects duplicate account code in same COA", async () => {
        const result = await createAccount({
            clientId: TEST_CLIENT_ID,
            coaId: TEST_COA_ID,
            accountCode: "5100",
            accountName: "Duplicate Code",
            accountType: "expense",
            normalBalance: "debit",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("already exists");
    });

    it("updates the account name", async () => {
        const result = await updateAccount({
            clientId: TEST_CLIENT_ID,
            accountId,
            accountName: "General Office Expenses",
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.previousName).toBe("Office Expenses");
        expect(data.data.accountName).toBe("General Office Expenses");
    });
});

// ── Quotation Status Lifecycle ───────────────────────────────────

describe("Integration: Quotation lifecycle", () => {
    let customerId: string;
    let quotationId: string;

    beforeAll(async () => {
        await seedTestData();
        const custResult = await createCustomer({
            clientId: TEST_CLIENT_ID,
            name: "Quotation Customer",
            email: "quotecust@example.com",
            createdBy: TEST_USER_ID,
        });
        customerId = parseResult(custResult).data.id;
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a quotation", async () => {
        const result = await createQuotation({
            clientId: TEST_CLIENT_ID,
            customerId,
            lineItems: [
                { description: "Web Development", quantity: 1, unitPrice: 5000 },
                { description: "Hosting (annual)", quantity: 1, unitPrice: 1200, taxRate: 6 },
            ],
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.quotationNumber).toMatch(/^QUO-/);
        expect(data.data.status).toBe("draft");
        quotationId = data.data.id;
    });

    it("transitions draft → sent", async () => {
        const result = await updateQuotationStatus({
            clientId: TEST_CLIENT_ID,
            quotationId,
            newStatus: "sent",
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.previousStatus).toBe("draft");
        expect(data.data.newStatus).toBe("sent");
    });

    it("transitions sent → accepted", async () => {
        const result = await updateQuotationStatus({
            clientId: TEST_CLIENT_ID,
            quotationId,
            newStatus: "accepted",
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
    });

    it("rejects invalid transition (accepted → sent)", async () => {
        const result = await updateQuotationStatus({
            clientId: TEST_CLIENT_ID,
            quotationId,
            newStatus: "sent",
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("Cannot transition");
    });
});

// ── Bill Lifecycle ───────────────────────────────────────────────

describe("Integration: Bill lifecycle", () => {
    let vendorId: string;
    let billId: string;

    beforeAll(async () => {
        await seedTestData();
        const vendResult = await createVendor({
            clientId: TEST_CLIENT_ID,
            name: "Bill Vendor",
            createdBy: TEST_USER_ID,
        });
        vendorId = parseResult(vendResult).data.id;
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a bill", async () => {
        const result = await createBill({
            clientId: TEST_CLIENT_ID,
            vendorId,
            lineItems: [
                { description: "Office Supplies", quantity: 10, unitPrice: 50, taxRate: 6 },
            ],
            dueDate: "2026-04-15",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.billNumber).toMatch(/^BIL-/);
        expect(data.data.status).toBe("draft");
        billId = data.data.id;
    });

    it("transitions draft → approved", async () => {
        const result = await updateBillStatus({
            clientId: TEST_CLIENT_ID,
            billId,
            newStatus: "approved",
        });
        expect(parseResult(result).success).toBe(true);
    });

    it("transitions approved → awaiting_payment", async () => {
        const result = await updateBillStatus({
            clientId: TEST_CLIENT_ID,
            billId,
            newStatus: "awaiting_payment",
        });
        expect(parseResult(result).success).toBe(true);
    });

    it("transitions awaiting_payment → paid", async () => {
        const result = await updateBillStatus({
            clientId: TEST_CLIENT_ID,
            billId,
            newStatus: "paid",
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.newStatus).toBe("paid");
    });

    it("rejects transition from paid (terminal)", async () => {
        const result = await updateBillStatus({
            clientId: TEST_CLIENT_ID,
            billId,
            newStatus: "draft",
        });
        expect(parseResult(result).success).toBe(false);
    });
});

// ── Purchase Order Lifecycle ─────────────────────────────────────

describe("Integration: Purchase Order lifecycle", () => {
    let vendorId: string;
    let poId: string;

    beforeAll(async () => {
        await seedTestData();
        const vendResult = await createVendor({
            clientId: TEST_CLIENT_ID,
            name: "PO Vendor",
            createdBy: TEST_USER_ID,
        });
        vendorId = parseResult(vendResult).data.id;
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates a purchase order", async () => {
        const result = await createPurchaseOrder({
            clientId: TEST_CLIENT_ID,
            vendorId,
            lineItems: [
                { description: "Laptop", quantity: 2, unitPrice: 3500 },
            ],
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(true);
        expect(data.data.poNumber).toMatch(/^PO-/);
        poId = data.data.id;
    });

    it("transitions draft → approved → received → closed", async () => {
        let result = await updatePurchaseOrderStatus({
            clientId: TEST_CLIENT_ID,
            purchaseOrderId: poId,
            newStatus: "approved",
        });
        expect(parseResult(result).success).toBe(true);

        result = await updatePurchaseOrderStatus({
            clientId: TEST_CLIENT_ID,
            purchaseOrderId: poId,
            newStatus: "received",
        });
        expect(parseResult(result).success).toBe(true);

        result = await updatePurchaseOrderStatus({
            clientId: TEST_CLIENT_ID,
            purchaseOrderId: poId,
            newStatus: "closed",
        });
        expect(parseResult(result).success).toBe(true);
    });
});

// ── Tenant Isolation ─────────────────────────────────────────────

describe("Integration: Tenant isolation for new tools", () => {
    let customerId: string;

    beforeAll(async () => {
        await seedTestData();
        const result = await createCustomer({
            clientId: TEST_CLIENT_ID,
            name: "Isolation Test",
            email: "isolation@example.com",
            createdBy: TEST_USER_ID,
        });
        customerId = parseResult(result).data.id;
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("wrong tenant cannot see customer", async () => {
        const result = await getCustomers({ clientId: "client_wrong_tenant_xyz" });
        const data = parseResult(result);
        // Should succeed but return empty (or error if no COA)
        if (data.success) {
            const found = data.data.customers.find((c: Record<string, unknown>) => c.id === customerId);
            expect(found).toBeUndefined();
        }
    });

    it("wrong tenant cannot update customer", async () => {
        const result = await updateCustomer({
            clientId: "client_wrong_tenant_xyz",
            customerId,
            name: "Hacked Name",
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
    });

    it("wrong tenant cannot delete customer", async () => {
        const result = await deleteCustomer({
            clientId: "client_wrong_tenant_xyz",
            customerId,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
    });

    it("rejects invalid TypeID prefix", async () => {
        const result = await updateCustomer({
            clientId: TEST_CLIENT_ID,
            customerId: "invalid_prefix_123",
            name: "Bad ID",
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("expected format");
    });

    it("rejects both tenant IDs", async () => {
        const result = await createCustomer({
            clientId: TEST_CLIENT_ID,
            accountingFirmId: "accfirm_test",
            name: "Both Tenants",
            email: "both@example.com",
            createdBy: TEST_USER_ID,
        });
        const data = parseResult(result);
        expect(data.success).toBe(false);
        expect(data.error).toContain("Exactly one");
    });
});

// ── Scope enforcement via withTenant ─────────────────────────────
// This tests that the withTenant wrapper correctly checks scopes
// when used with the t() helper from server.ts. Since we can't
// easily test the full server registration in integration, we
// verify the scope logic in unit tests (granular-scopes.test.ts).
