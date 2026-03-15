/**
 * MCP Server Load Test
 *
 * Tests HTTP endpoint performance under concurrent load.
 * Requires:
 *   1. MCP server running: MCP_TRANSPORT=http pnpm dev:http
 *   2. A valid API key (set MCP_TEST_API_KEY env var)
 *
 * Usage:
 *   MCP_TEST_API_KEY=cak_... npx tsx tests/load/load-test.ts
 *
 * Options (env vars):
 *   LOAD_TEST_URL      - Server URL (default: http://localhost:3100)
 *   LOAD_TEST_RPS      - Requests per second (default: 20)
 *   LOAD_TEST_DURATION  - Duration in seconds (default: 60)
 *   MCP_TEST_API_KEY   - Bearer token for auth
 */

const BASE_URL = process.env.LOAD_TEST_URL || "http://localhost:3100";
const TARGET_RPS = parseInt(process.env.LOAD_TEST_RPS || "20", 10);
const DURATION_S = parseInt(process.env.LOAD_TEST_DURATION || "60", 10);
const API_KEY = process.env.MCP_TEST_API_KEY;

if (!API_KEY) {
    console.error("Error: MCP_TEST_API_KEY is required");
    console.error("Usage: MCP_TEST_API_KEY=cak_... npx tsx tests/load/load-test.ts");
    process.exit(1);
}

interface RequestResult {
    status: number;
    durationMs: number;
    error?: string;
}

const results: RequestResult[] = [];
let sessionId: string | null = null;

async function initializeSession(): Promise<void> {
    const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "load-test", version: "1.0.0" },
        },
    };

    const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Initialize failed: ${res.status} ${await res.text()}`);
    }

    sessionId = res.headers.get("mcp-session-id");
    if (!sessionId) {
        throw new Error("No session ID in response headers");
    }

    // Send initialized notification
    await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
            "mcp-session-id": sessionId,
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
        }),
    });

    console.log(`Session initialized: ${sessionId}`);
}

async function callTool(toolName: string, args: Record<string, unknown>): Promise<RequestResult> {
    const start = Date.now();
    try {
        const body = {
            jsonrpc: "2.0",
            id: Math.floor(Math.random() * 1_000_000),
            method: "tools/call",
            params: { name: toolName, arguments: args },
        };

        const res = await fetch(`${BASE_URL}/mcp`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${API_KEY}`,
                ...(sessionId ? { "mcp-session-id": sessionId } : {}),
            },
            body: JSON.stringify(body),
        });

        const durationMs = Date.now() - start;
        return { status: res.status, durationMs };
    } catch (error) {
        const durationMs = Date.now() - start;
        return {
            status: 0,
            durationMs,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

// Read-only tools to test (no side effects)
const readTools = [
    { name: "get_company_profile", args: {} },
    { name: "get_chart_of_accounts", args: { compact: true } },
    { name: "get_financial_accounts", args: {} },
    { name: "get_account_balances", args: {} },
    { name: "get_financial_summary", args: {} },
];

function pickRandomTool() {
    return readTools[Math.floor(Math.random() * readTools.length)];
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

async function run(): Promise<void> {
    console.log("=== MCP Server Load Test ===");
    console.log(`Target: ${BASE_URL}`);
    console.log(`Rate: ${TARGET_RPS} req/s for ${DURATION_S}s`);
    console.log(`Total expected: ~${TARGET_RPS * DURATION_S} requests\n`);

    // Health check
    try {
        const healthRes = await fetch(`${BASE_URL}/health`);
        const health = await healthRes.json();
        console.log(`Server health: ${health.status}, version: ${health.version}\n`);
    } catch {
        console.error("Server not reachable at", BASE_URL);
        process.exit(1);
    }

    // Initialize MCP session
    await initializeSession();

    const intervalMs = 1000 / TARGET_RPS;
    const endTime = Date.now() + DURATION_S * 1000;
    let sent = 0;
    let completed = 0;
    let errors = 0;

    // Progress reporting
    const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (endTime - DURATION_S * 1000)) / 1000);
        console.log(
            `  [${elapsed}s] Sent: ${sent}, Completed: ${completed}, Errors: ${errors}`,
        );
    }, 5_000);

    // Send requests at target rate
    while (Date.now() < endTime) {
        const tool = pickRandomTool();
        // Fire-and-forget, track in results
        callTool(tool.name, tool.args).then((result) => {
            results.push(result);
            completed++;
            if (result.status !== 200 || result.error) errors++;
        }).catch(() => {
            errors++;
            completed++;
        });
        sent++;
        await sleep(intervalMs);
    }

    // Wait for remaining responses (max 10s)
    const waitEnd = Date.now() + 10_000;
    while (completed < sent && Date.now() < waitEnd) {
        await sleep(100);
    }

    clearInterval(progressInterval);

    // Results
    const durations = results.map((r) => r.durationMs);
    const statusCounts: Record<number, number> = {};
    for (const r of results) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    console.log("\n=== Results ===");
    console.log(`Total sent:      ${sent}`);
    console.log(`Total completed: ${completed}`);
    console.log(`Total errors:    ${errors}`);
    console.log(`Error rate:      ${completed > 0 ? ((errors / completed) * 100).toFixed(1) : "N/A"}%`);
    console.log(`\nStatus codes:`);
    for (const [code, count] of Object.entries(statusCounts)) {
        console.log(`  ${code}: ${count}`);
    }

    if (durations.length === 0) {
        console.log("\nNo requests completed — cannot compute latency stats.");
        process.exit(1);
    }

    console.log(`\nLatency (ms):`);
    console.log(`  Min:    ${Math.min(...durations)}`);
    console.log(`  P50:    ${percentile(durations, 50)}`);
    console.log(`  P95:    ${percentile(durations, 95)}`);
    console.log(`  P99:    ${percentile(durations, 99)}`);
    console.log(`  Max:    ${Math.max(...durations)}`);
    console.log(`  Avg:    ${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)}`);

    // Pass/fail criteria
    const p95 = percentile(durations, 95);
    const p99 = percentile(durations, 99);
    const errorRate = completed > 0 ? errors / completed : 1;

    console.log("\n=== Criteria ===");
    const checks = [
        { name: "P95 < 200ms (read)", pass: p95 < 200, actual: `${p95}ms` },
        { name: "P99 < 500ms (read)", pass: p99 < 500, actual: `${p99}ms` },
        { name: "Error rate < 1%", pass: errorRate < 0.01, actual: `${(errorRate * 100).toFixed(1)}%` },
    ];

    let allPass = true;
    for (const check of checks) {
        const icon = check.pass ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${check.name} (actual: ${check.actual})`);
        if (!check.pass) allPass = false;
    }

    // Fetch metrics
    try {
        const metricsRes = await fetch(`${BASE_URL}/metrics`);
        const metricsText = await metricsRes.text();
        console.log("\n=== Prometheus Metrics (sample) ===");
        const relevantLines = metricsText
            .split("\n")
            .filter((l) => l.startsWith("mcp_") && !l.startsWith("#"))
            .slice(0, 15);
        for (const line of relevantLines) {
            console.log(`  ${line}`);
        }
    } catch {
        console.log("\n(Metrics endpoint not available)");
    }

    process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
    console.error("Load test failed:", err);
    process.exit(1);
});
