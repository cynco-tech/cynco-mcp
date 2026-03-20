/**
 * Integration test setup.
 *
 * Requires the test Postgres to be running:
 *   cd remix && pnpm run test:db:up
 *
 * Then push the schema:
 *   cd remix && DATABASE_URL=postgresql://cynco_test:cynco_test@localhost:5434/cynco_test pnpm drizzle-kit push
 *
 * Then run:
 *   CYNCO_DATABASE_URL=postgresql://cynco_test:cynco_test@localhost:5434/cynco_test pnpm test:integration
 */

import pg from "pg";

const { Pool } = pg;

const TEST_DB_URL =
    process.env.CYNCO_DATABASE_URL ||
    "postgresql://cynco_test:cynco_test@localhost:5434/cynco_test";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
    if (!pool) {
        pool = new Pool({ connectionString: TEST_DB_URL, max: 3 });
    }
    return pool;
}

export async function testQuery<T extends pg.QueryResultRow = Record<string, unknown>>(
    text: string,
    params?: unknown[],
): Promise<pg.QueryResult<T>> {
    return getPool().query<T>(text, params);
}

export const TEST_CLIENT_ID = "client_integration_test_001";
export const TEST_USER_ID = "usr_integration_test_001";
export const TEST_COA_ID = "coa_integration_test_001";
export const TEST_ACCOUNT_ID_CASH = "acc_integration_cash_001";
export const TEST_ACCOUNT_ID_REVENUE = "acc_integration_rev_001";
export const TEST_FIN_ACCOUNT_ID = "fac_integration_test_001";

export async function seedTestData(): Promise<void> {
    // Clean up any previous test data
    await cleanupTestData();

    // Create test client
    await testQuery(
        `INSERT INTO client_details (id, company_name, registration_type, is_onboarded)
         VALUES ($1, 'Integration Test Co', 'sole_proprietorship', true)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_CLIENT_ID],
    );

    // Create test user
    await testQuery(
        `INSERT INTO users (id, username, email, role, user_type, client_id)
         VALUES ($1, 'testuser', 'test@example.com', 'mainAdmin', 'client', $2)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_USER_ID, TEST_CLIENT_ID],
    );

    // Create chart of accounts
    await testQuery(
        `INSERT INTO chart_of_accounts (id, name, client_id, base_currency, is_active, access_type, source, account_count)
         VALUES ($1, 'Test COA', $2, 'MYR', true, 'specific', 'system', 2)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_COA_ID, TEST_CLIENT_ID],
    );

    // Create accounts
    await testQuery(
        `INSERT INTO accounts (id, coa_id, account_code, account_name, account_type, normal_balance, level, is_active)
         VALUES ($1, $2, '1000', 'Cash', 'asset', 'debit', 1, true)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_ACCOUNT_ID_CASH, TEST_COA_ID],
    );
    await testQuery(
        `INSERT INTO accounts (id, coa_id, account_code, account_name, account_type, normal_balance, level, is_active)
         VALUES ($1, $2, '4000', 'Sales Revenue', 'revenue', 'credit', 1, true)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_ACCOUNT_ID_REVENUE, TEST_COA_ID],
    );

    // Create financial account
    await testQuery(
        `INSERT INTO financial_accounts (id, client_id, institution_name, account_name, account_type, currency, current_balance, is_active)
         VALUES ($1, $2, 'Test Bank', 'Main Account', 'checking', 'MYR', 10000, true)
         ON CONFLICT (id) DO NOTHING`,
        [TEST_FIN_ACCOUNT_ID, TEST_CLIENT_ID],
    );
}

export async function cleanupTestData(): Promise<void> {
    // Delete in reverse dependency order — new entities first, then originals
    const tables = [
        "entity_tags",
        "tags",
        "billing_schedule_milestones",
        "billing_schedules",
        "agreement_signers",
        "agreements",
        "credit_debit_notes",
        "recurring_invoice_templates",
        "invoices",
        "quotations",
        "bill_payments",
        "bills",
        "purchase_orders",
        "items",
        "customers",
        "vendors",
        "general_ledger",
        "journal_entry_lines",
        "journal_entries",
        "bank_transactions",
        "categorization_rules",
        "account_balances",
        "financial_accounts",
        "accounts",
        "chart_of_accounts",
        "mcp_api_keys",
        "users",
        "client_details",
    ];

    for (const table of tables) {
        try {
            await testQuery(`DELETE FROM ${table} WHERE client_id = $1`, [TEST_CLIENT_ID]);
        } catch (e) {
            // Table might not have client_id column — try fallback
            if (process.env.DEBUG_CLEANUP) console.debug(`Cleanup ${table} by client_id failed:`, e);
            try {
                if (table === "accounts") {
                    await testQuery(
                        `DELETE FROM accounts WHERE coa_id = $1`,
                        [TEST_COA_ID],
                    );
                } else if (table === "journal_entry_lines") {
                    await testQuery(
                        `DELETE FROM journal_entry_lines WHERE journal_entry_id IN (
                            SELECT id FROM journal_entries WHERE client_id = $1
                        )`,
                        [TEST_CLIENT_ID],
                    );
                }
            } catch (inner) {
                if (process.env.DEBUG_CLEANUP) console.debug(`Cleanup ${table} fallback failed:`, inner);
            }
        }
    }
}

export async function shutdownTestDb(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
