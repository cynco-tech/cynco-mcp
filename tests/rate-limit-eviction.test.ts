import { describe, it, expect } from "vitest";

/**
 * Tests the rate limit emergency eviction logic added during the audit.
 * We replicate the exact algorithm from index.ts to test in isolation
 * (index.ts has side effects — DB pool, HTTP server — that prevent direct import).
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

function createRateLimiterWithEviction(maxRequests = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS) {
  const map = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
      const now = Date.now();

      // Emergency eviction if map grows too large (e.g., many distinct tenants)
      if (map.size > 10_000) {
        for (const [k, e] of map) {
          if (now >= e.resetAt) map.delete(k);
          if (map.size <= 5_000) break;
        }
      }

      const entry = map.get(key);
      if (!entry || now >= entry.resetAt) {
        map.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
      }

      entry.count++;
      return {
        allowed: entry.count <= maxRequests,
        remaining: Math.max(0, maxRequests - entry.count),
        resetAt: entry.resetAt,
      };
    },
    get map() { return map; },
  };
}

describe("rate limit emergency eviction", () => {
  it("does not evict when map is under 10K entries", () => {
    const limiter = createRateLimiterWithEviction();
    for (let i = 0; i < 100; i++) {
      limiter.check(`tenant_${i}`);
    }
    expect(limiter.map.size).toBe(100);
  });

  it("evicts expired entries when map exceeds 10K", () => {
    const limiter = createRateLimiterWithEviction(120, 1); // 1ms window = instantly expired

    // Fill with 10,001 entries that will all be expired by the time we check
    for (let i = 0; i < 10_001; i++) {
      limiter.map.set(`tenant_${i}`, { count: 1, resetAt: Date.now() - 1 });
    }
    expect(limiter.map.size).toBe(10_001);

    // This check triggers eviction
    limiter.check("trigger_tenant");

    // Should have evicted down to ≤5000 + the new entry
    expect(limiter.map.size).toBeLessThanOrEqual(5_002);
  });

  it("only evicts expired entries, keeps active ones", () => {
    const limiter = createRateLimiterWithEviction();
    const now = Date.now();

    // Add 6000 expired entries
    for (let i = 0; i < 6_000; i++) {
      limiter.map.set(`expired_${i}`, { count: 1, resetAt: now - 1 });
    }
    // Add 5000 active entries
    for (let i = 0; i < 5_000; i++) {
      limiter.map.set(`active_${i}`, { count: 1, resetAt: now + 60_000 });
    }
    expect(limiter.map.size).toBe(11_000);

    // Trigger eviction
    limiter.check("new_tenant");

    // All 6000 expired should be evicted (stops at 5000), active ones remain
    // The eviction loop deletes expired entries until size <= 5000
    expect(limiter.map.size).toBeLessThanOrEqual(5_002);
    // Active entries should still be present
    expect(limiter.map.has("active_0")).toBe(true);
  });

  it("stops eviction early once map drops to 5K", () => {
    const limiter = createRateLimiterWithEviction();
    const now = Date.now();

    // 8000 expired + 3000 active = 11000 total
    for (let i = 0; i < 8_000; i++) {
      limiter.map.set(`expired_${i}`, { count: 1, resetAt: now - 1 });
    }
    for (let i = 0; i < 3_000; i++) {
      limiter.map.set(`active_${i}`, { count: 1, resetAt: now + 60_000 });
    }

    limiter.check("trigger");

    // Should stop at ~5000, not delete ALL expired entries
    expect(limiter.map.size).toBeLessThanOrEqual(5_002);
    expect(limiter.map.size).toBeGreaterThanOrEqual(3_000); // at least the active ones
  });
});
