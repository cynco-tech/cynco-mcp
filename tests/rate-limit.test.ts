import { describe, it, expect } from "vitest";

// Test the rate limit logic in isolation (same algorithm as index.ts)
function createRateLimiter(maxRequests: number, windowMs: number) {
  const map = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
      const now = Date.now();
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
    map,
  };
}

describe("rate limiting", () => {
  it("allows requests under the limit", () => {
    const limiter = createRateLimiter(3, 60000);
    expect(limiter.check("tenant_a").allowed).toBe(true);
    expect(limiter.check("tenant_a").allowed).toBe(true);
    expect(limiter.check("tenant_a").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = createRateLimiter(2, 60000);
    limiter.check("tenant_a");
    limiter.check("tenant_a");
    expect(limiter.check("tenant_a").allowed).toBe(false);
  });

  it("returns correct remaining count", () => {
    const limiter = createRateLimiter(5, 60000);
    expect(limiter.check("tenant_a").remaining).toBe(4);
    expect(limiter.check("tenant_a").remaining).toBe(3);
    expect(limiter.check("tenant_a").remaining).toBe(2);
  });

  it("remaining never goes below 0", () => {
    const limiter = createRateLimiter(1, 60000);
    limiter.check("tenant_a");
    const result = limiter.check("tenant_a");
    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
  });

  it("isolates tenants", () => {
    const limiter = createRateLimiter(1, 60000);
    expect(limiter.check("tenant_a").allowed).toBe(true);
    expect(limiter.check("tenant_b").allowed).toBe(true);
    expect(limiter.check("tenant_a").allowed).toBe(false);
    expect(limiter.check("tenant_b").allowed).toBe(false);
  });

  it("returns resetAt timestamp", () => {
    const limiter = createRateLimiter(5, 60000);
    const result = limiter.check("tenant_a");
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60001);
  });
});
