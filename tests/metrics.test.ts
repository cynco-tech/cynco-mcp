import { describe, it, expect, beforeEach } from "vitest";
import {
    requestsTotal,
    requestDuration,
    rateLimitHitsTotal,
    authFailuresTotal,
    recordToolExecution,
    serializeMetrics,
    registerDbPoolGauge,
    registerSessionsGauge,
} from "../src/metrics.js";

describe("serializeMetrics", () => {
    it("returns valid Prometheus exposition format", () => {
        const output = serializeMetrics();
        expect(output).toContain("# HELP mcp_requests_total");
        expect(output).toContain("# TYPE mcp_requests_total counter");
        expect(output).toContain("# HELP mcp_request_duration_seconds");
        expect(output).toContain("# TYPE mcp_request_duration_seconds histogram");
        expect(output).toContain("# HELP mcp_rate_limit_hits_total");
        expect(output).toContain("# HELP mcp_auth_failures_total");
        expect(output.endsWith("\n")).toBe(true);
    });
});

describe("recordToolExecution", () => {
    it("increments counter and records histogram", () => {
        recordToolExecution("get_chart_of_accounts", true, 150);
        const output = serializeMetrics();
        expect(output).toContain('mcp_requests_total{tool="get_chart_of_accounts",status="success"}');
        expect(output).toContain("mcp_request_duration_seconds_bucket");
    });

    it("records errors separately", () => {
        recordToolExecution("create_journal_entries", false, 50);
        const output = serializeMetrics();
        expect(output).toContain('mcp_requests_total{tool="create_journal_entries",status="error"}');
    });
});

describe("rateLimitHitsTotal", () => {
    it("tracks rate limit hits by tenant type", () => {
        rateLimitHitsTotal.inc({ tenant_type: "client" });
        rateLimitHitsTotal.inc({ tenant_type: "client" });
        const output = serializeMetrics();
        expect(output).toContain('mcp_rate_limit_hits_total{tenant_type="client"} 2');
    });
});

describe("authFailuresTotal", () => {
    it("tracks auth failures by reason", () => {
        authFailuresTotal.inc({ reason: "invalid_or_missing" });
        const output = serializeMetrics();
        expect(output).toContain('mcp_auth_failures_total{reason="invalid_or_missing"}');
    });
});

describe("gauge registration", () => {
    it("includes db pool gauge after registration", () => {
        registerDbPoolGauge(() => ({ total: 5, idle: 3, waiting: 0 }));
        const output = serializeMetrics();
        expect(output).toContain("mcp_db_pool_connections");
        expect(output).toContain('{state="total"} 5');
        expect(output).toContain('{state="idle"} 3');
        expect(output).toContain('{state="waiting"} 0');
    });

    it("includes session gauge after registration", () => {
        registerSessionsGauge(() => 7);
        const output = serializeMetrics();
        expect(output).toContain("mcp_active_sessions");
        expect(output).toContain('{state="active"} 7');
    });
});

describe("histogram buckets", () => {
    it("produces correct cumulative bucket counts", () => {
        // Record a 50ms request
        recordToolExecution("test_tool_hist", true, 50);
        const output = serializeMetrics();

        // 50ms = 0.05s, should land in the 0.05 bucket
        // Cumulative: le=0.01 -> 0, le=0.025 -> 0, le=0.05 -> 1, le=0.1 -> 1, ..., le=+Inf -> 1
        expect(output).toContain('mcp_request_duration_seconds_bucket{tool="test_tool_hist",le="0.01"} 0');
        expect(output).toContain('mcp_request_duration_seconds_bucket{tool="test_tool_hist",le="0.025"} 0');
        expect(output).toContain('mcp_request_duration_seconds_bucket{tool="test_tool_hist",le="0.05"} 1');
        expect(output).toContain('mcp_request_duration_seconds_bucket{tool="test_tool_hist",le="0.1"} 1');
        expect(output).toContain('mcp_request_duration_seconds_bucket{tool="test_tool_hist",le="+Inf"} 1');
        expect(output).toContain('mcp_request_duration_seconds_sum{tool="test_tool_hist"} 0.05');
        expect(output).toContain('mcp_request_duration_seconds_count{tool="test_tool_hist"} 1');
    });
});
