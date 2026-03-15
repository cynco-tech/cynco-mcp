/**
 * Lightweight Prometheus metrics for the MCP server.
 * No external dependencies — generates text/plain exposition format.
 */

// ── Counters ────────────────────────────────────────────────────

interface CounterEntry {
    labels: Record<string, string>;
    value: number;
}

class Counter {
    readonly name: string;
    readonly help: string;
    private entries: CounterEntry[] = [];

    constructor(name: string, help: string) {
        this.name = name;
        this.help = help;
    }

    inc(labels: Record<string, string>, amount = 1): void {
        const entry = this.entries.find((e) => labelsMatch(e.labels, labels));
        if (entry) {
            entry.value += amount;
        } else {
            this.entries.push({ labels, value: amount });
        }
    }

    serialize(): string {
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
        for (const entry of this.entries) {
            lines.push(`${this.name}${formatLabels(entry.labels)} ${entry.value}`);
        }
        return lines.join("\n");
    }
}

// ── Histograms ──────────────────────────────────────────────────

interface HistogramBucket {
    labels: Record<string, string>;
    buckets: number[];
    counts: number[];
    sum: number;
    count: number;
}

class Histogram {
    readonly name: string;
    readonly help: string;
    private readonly boundaries: number[];
    private entries: HistogramBucket[] = [];

    constructor(name: string, help: string, boundaries: number[]) {
        this.name = name;
        this.help = help;
        this.boundaries = boundaries.sort((a, b) => a - b);
    }

    observe(labels: Record<string, string>, value: number): void {
        let entry = this.entries.find((e) => labelsMatch(e.labels, labels));
        if (!entry) {
            entry = {
                labels,
                buckets: [...this.boundaries],
                counts: new Array(this.boundaries.length + 1).fill(0), // +1 for +Inf
                sum: 0,
                count: 0,
            };
            this.entries.push(entry);
        }

        entry.sum += value;
        entry.count++;
        let placed = false;
        for (let i = 0; i < this.boundaries.length; i++) {
            if (value <= this.boundaries[i]) {
                entry.counts[i]++;
                placed = true;
                break;
            }
        }
        if (!placed) {
            entry.counts[this.boundaries.length]++; // +Inf for values above all boundaries
        }
    }

    serialize(): string {
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
        for (const entry of this.entries) {
            let cumulative = 0;
            for (let i = 0; i < this.boundaries.length; i++) {
                cumulative += entry.counts[i];
                lines.push(
                    `${this.name}_bucket${formatLabels({ ...entry.labels, le: String(this.boundaries[i]) })} ${cumulative}`,
                );
            }
            cumulative += entry.counts[this.boundaries.length];
            lines.push(
                `${this.name}_bucket${formatLabels({ ...entry.labels, le: "+Inf" })} ${cumulative}`,
            );
            lines.push(`${this.name}_sum${formatLabels(entry.labels)} ${entry.sum}`);
            lines.push(`${this.name}_count${formatLabels(entry.labels)} ${entry.count}`);
        }
        return lines.join("\n");
    }
}

// ── Gauges ──────────────────────────────────────────────────────

type GaugeFn = () => Record<string, number>;

class Gauge {
    readonly name: string;
    readonly help: string;
    private readonly fn: GaugeFn;

    constructor(name: string, help: string, fn: GaugeFn) {
        this.name = name;
        this.help = help;
        this.fn = fn;
    }

    serialize(): string {
        const values = this.fn();
        const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
        for (const [label, value] of Object.entries(values)) {
            lines.push(`${this.name}{state="${label}"} ${value}`);
        }
        return lines.join("\n");
    }
}

// ── Helpers ─────────────────────────────────────────────────────

function labelsMatch(a: Record<string, string>, b: Record<string, string>): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => a[k] === b[k]);
}

function escapeLabel(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    return `{${entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",")}}`;
}

// ── Registry ────────────────────────────────────────────────────

export const requestsTotal = new Counter(
    "mcp_requests_total",
    "Total MCP tool requests",
);

export const requestDuration = new Histogram(
    "mcp_request_duration_seconds",
    "MCP tool request duration in seconds",
    [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

export const rateLimitHitsTotal = new Counter(
    "mcp_rate_limit_hits_total",
    "Total rate limit exceeded events",
);

export const authFailuresTotal = new Counter(
    "mcp_auth_failures_total",
    "Total authentication failures",
);

let dbPoolGauge: Gauge | null = null;
let activeSessionsGauge: Gauge | null = null;

export function registerDbPoolGauge(fn: () => { total: number; idle: number; waiting: number }): void {
    dbPoolGauge = new Gauge("mcp_db_pool_connections", "Database connection pool state", () => {
        const stats = fn();
        return { total: stats.total, idle: stats.idle, waiting: stats.waiting };
    });
}

export function registerSessionsGauge(fn: () => number): void {
    activeSessionsGauge = new Gauge("mcp_active_sessions", "Active MCP sessions", () => ({
        active: fn(),
    }));
}

// ── Tool execution helpers ──────────────────────────────────────

export function recordToolExecution(tool: string, success: boolean, durationMs: number): void {
    const status = success ? "success" : "error";
    requestsTotal.inc({ tool, status });
    requestDuration.observe({ tool }, durationMs / 1000);
}

// ── Serialization ───────────────────────────────────────────────

export function serializeMetrics(): string {
    const parts: string[] = [
        requestsTotal.serialize(),
        requestDuration.serialize(),
        rateLimitHitsTotal.serialize(),
        authFailuresTotal.serialize(),
    ];

    if (dbPoolGauge) parts.push(dbPoolGauge.serialize());
    if (activeSessionsGauge) parts.push(activeSessionsGauge.serialize());

    return parts.filter((p) => p.length > 0).join("\n\n") + "\n";
}
