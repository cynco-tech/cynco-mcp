import { describe, it, expect } from "vitest";
import { getPoolStats } from "../src/db.js";
import type { PoolStats } from "../src/db.js";

describe("getPoolStats", () => {
  it("returns pool statistics", () => {
    const stats: PoolStats = getPoolStats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("idle");
    expect(stats).toHaveProperty("waiting");
    expect(typeof stats.total).toBe("number");
    expect(typeof stats.idle).toBe("number");
    expect(typeof stats.waiting).toBe("number");
    expect(stats.total).toBeGreaterThanOrEqual(0);
    expect(stats.idle).toBeGreaterThanOrEqual(0);
    expect(stats.waiting).toBeGreaterThanOrEqual(0);
  });
});
