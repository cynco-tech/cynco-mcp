import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    seedTestData,
    cleanupTestData,
    shutdownTestDb,
    testQuery,
    TEST_CLIENT_ID,
    TEST_FIN_ACCOUNT_ID,
} from "./setup.js";
import { getChartOfAccounts } from "../../src/tools/get-chart-of-accounts.js";
import { getFinancialAccounts } from "../../src/tools/get-financial-accounts.js";
import { getAccountBalances } from "../../src/tools/get-account-balances.js";
import { searchAccounts } from "../../src/tools/search-accounts.js";
import { getFinancialSummary } from "../../src/tools/get-financial-summary.js";
import { getCompanyProfile } from "../../src/tools/get-company-profile.js";
import { createBankTransactions } from "../../src/tools/create-bank-transactions.js";
import { getBankTransactions } from "../../src/tools/get-bank-transactions.js";

function parseResult(result: { content: Array<{ text?: string }> }) {
    const text = result.content[0]?.text;
    if (!text) throw new Error("No content in result");
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Failed to parse result: ${text.slice(0, 200)}`);
    }
}

// Single file-level teardown to avoid closing shared pool multiple times
afterAll(async () => {
    await shutdownTestDb();
});

describe("Integration: Read tools", () => {
    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("get_chart_of_accounts returns COA with accounts", async () => {
        const result = await getChartOfAccounts({ clientId: TEST_CLIENT_ID });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.chartOfAccounts.name).toBe("Test COA");
        expect(data.data.accounts.length).toBeGreaterThanOrEqual(2);

        const cash = data.data.accounts.find(
            (a: Record<string, unknown>) => a.accountCode === "1000",
        );
        expect(cash).toBeDefined();
        expect(cash.accountName).toBe("Cash");
        expect(cash.accountType).toBe("asset");
    });

    it("get_chart_of_accounts compact mode returns fewer fields", async () => {
        const result = await getChartOfAccounts({
            clientId: TEST_CLIENT_ID,
            compact: true,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        const account = data.data.accounts[0];
        expect(account).toHaveProperty("id");
        expect(account).toHaveProperty("accountCode");
        expect(account).toHaveProperty("accountName");
        expect(account).toHaveProperty("accountType");
        expect(account).not.toHaveProperty("normalBalance");
        expect(account).not.toHaveProperty("mappingKeywords");
    });

    it("get_chart_of_accounts filters by accountType", async () => {
        const result = await getChartOfAccounts({
            clientId: TEST_CLIENT_ID,
            accountType: "revenue",
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(
            data.data.accounts.every(
                (a: Record<string, unknown>) => a.accountType === "revenue",
            ),
        ).toBe(true);
    });

    it("get_financial_accounts returns accounts", async () => {
        const result = await getFinancialAccounts({
            clientId: TEST_CLIENT_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.accounts.length).toBeGreaterThanOrEqual(1);
        expect(data.data.accounts[0].accountName).toBe("Main Account");
    });

    it("search_accounts finds by name", async () => {
        const result = await searchAccounts({
            clientId: TEST_CLIENT_ID,
            query: "Cash",
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.results.length).toBeGreaterThanOrEqual(1);
        expect(data.data.results[0].accountName).toContain("Cash");
    });

    it("search_accounts finds by code", async () => {
        const result = await searchAccounts({
            clientId: TEST_CLIENT_ID,
            query: "4000",
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.results.length).toBeGreaterThanOrEqual(1);
    });

    it("get_account_balances returns empty for no data", async () => {
        const result = await getAccountBalances({
            clientId: TEST_CLIENT_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        // No balances seeded, should be empty array
        expect(Array.isArray(data.data.balances)).toBe(true);
    });

    it("get_financial_summary returns summary", async () => {
        const result = await getFinancialSummary({
            clientId: TEST_CLIENT_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty("accountBalances");
    });

    it("get_company_profile returns client info", async () => {
        const result = await getCompanyProfile({
            clientId: TEST_CLIENT_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.companyName).toBe("Integration Test Co");
    });
});

describe("Integration: Tenant isolation", () => {
    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("returns no data for wrong tenant", async () => {
        const result = await getChartOfAccounts({
            clientId: "client_nonexistent_xyz",
        });
        const data = parseResult(result);

        expect(data.success).toBe(false);
        expect(data.error).toContain("No active chart of accounts");
    });

    it("rejects missing tenant", async () => {
        const result = await getChartOfAccounts({});
        const data = parseResult(result);

        expect(data.success).toBe(false);
        expect(data.error).toContain("Exactly one of clientId or accountingFirmId");
    });

    it("rejects both tenant IDs", async () => {
        const result = await getChartOfAccounts({
            clientId: TEST_CLIENT_ID,
            accountingFirmId: "accfirm_test",
        });
        const data = parseResult(result);

        expect(data.success).toBe(false);
    });
});

describe("Integration: Write tools", () => {
    beforeAll(async () => {
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("create_bank_transactions imports and deduplicates", async () => {
        const txns = [
            {
                transactionDate: "2026-01-15",
                transactionType: "credit" as const,
                amount: 1500.0,
                rawDescription: "Payment from Customer A",
            },
            {
                transactionDate: "2026-01-16",
                transactionType: "debit" as const,
                amount: 250.0,
                rawDescription: "Office supplies",
            },
        ];

        // First import
        const result1 = await createBankTransactions({
            clientId: TEST_CLIENT_ID,
            financialAccountId: TEST_FIN_ACCOUNT_ID,
            transactions: txns,
        });
        const data1 = parseResult(result1);
        expect(data1.success).toBe(true);
        expect(data1.data.imported).toBe(2);
        expect(data1.data.duplicatesSkipped).toBe(0);

        // Second import — should be deduplicated
        const result2 = await createBankTransactions({
            clientId: TEST_CLIENT_ID,
            financialAccountId: TEST_FIN_ACCOUNT_ID,
            transactions: txns,
        });
        const data2 = parseResult(result2);
        expect(data2.success).toBe(true);
        expect(data2.data.imported).toBe(0);
        expect(data2.data.duplicatesSkipped).toBe(2);
    });

    it("get_bank_transactions retrieves imported transactions", async () => {
        const result = await getBankTransactions({
            clientId: TEST_CLIENT_ID,
            financialAccountId: TEST_FIN_ACCOUNT_ID,
        });
        const data = parseResult(result);

        expect(data.success).toBe(true);
        expect(data.data.transactions.length).toBeGreaterThanOrEqual(2);
    });
});

describe("Integration: API key management", () => {
    // Import at top level since we're in an ESM module
    let generateApiKey: typeof import("../../src/auth.js").generateApiKey;
    let resolveApiKey: typeof import("../../src/auth.js").resolveApiKey;

    beforeAll(async () => {
        const auth = await import("../../src/auth.js");
        generateApiKey = auth.generateApiKey;
        resolveApiKey = auth.resolveApiKey;
        await seedTestData();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    it("creates and resolves an API key", async () => {
        const { rawKey, keyHash, keyPrefix } = generateApiKey();
        const id = "mak_integration_test_001";

        await testQuery(
            `INSERT INTO mcp_api_keys (id, key_hash, key_prefix, name, tenant_type, tenant_id, scopes, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [id, keyHash, keyPrefix, "Integration Test Key", "client", TEST_CLIENT_ID, ["read", "write"]],
        );

        const record = await resolveApiKey(rawKey);
        expect(record).not.toBeNull();
        expect(record!.id).toBe(id);
        expect(record!.tenantType).toBe("client");
        expect(record!.tenantId).toBe(TEST_CLIENT_ID);
        expect(record!.scopes).toEqual(["read", "write"]);
    });

    it("does not resolve revoked keys", async () => {
        const { rawKey, keyHash, keyPrefix } = generateApiKey();
        const id = "mak_integration_test_revoked";

        await testQuery(
            `INSERT INTO mcp_api_keys (id, key_hash, key_prefix, name, tenant_type, tenant_id, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, false)`,
            [id, keyHash, keyPrefix, "Revoked Key", "client", TEST_CLIENT_ID],
        );

        const record = await resolveApiKey(rawKey);
        expect(record).toBeNull();
    });

    it("does not resolve expired keys", async () => {
        const { rawKey, keyHash, keyPrefix } = generateApiKey();
        const id = "mak_integration_test_expired";
        const pastDate = new Date(Date.now() - 86_400_000).toISOString();

        await testQuery(
            `INSERT INTO mcp_api_keys (id, key_hash, key_prefix, name, tenant_type, tenant_id, is_active, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, true, $7)`,
            [id, keyHash, keyPrefix, "Expired Key", "client", TEST_CLIENT_ID, pastDate],
        );

        const record = await resolveApiKey(rawKey);
        expect(record).toBeNull();
    });
});
