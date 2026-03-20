import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, paginationResult } from "../src/utils/cursor.js";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a cursor value", () => {
    const cursor = encodeCursor("cust_abc123", "2026-01-15");
    const decoded = decodeCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe("cust_abc123");
    expect(decoded!.sortValue).toBe("2026-01-15");
  });

  it("produces URL-safe base64", () => {
    const cursor = encodeCursor("inv_abc123", "some value with spaces & symbols");
    expect(cursor).not.toContain("+");
    expect(cursor).not.toContain("/");
    expect(cursor).not.toContain("=");
  });

  it("returns null for invalid cursor", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
  });

  it("returns null for valid base64 but wrong structure", () => {
    const garbage = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
    expect(decodeCursor(garbage)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(decodeCursor("")).toBeNull();
  });

  it("handles special characters in IDs and sort values", () => {
    const cursor = encodeCursor("cust_abc/123+456", "name with \"quotes\"");
    const decoded = decodeCursor(cursor);
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe("cust_abc/123+456");
    expect(decoded!.sortValue).toBe("name with \"quotes\"");
  });
});

describe("paginationResult", () => {
  it("returns hasMore=false when rows <= limit", () => {
    const items = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
    ];
    const result = paginationResult(items, 10, 0, "name", (i) => i.name);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBeNull();
    expect(result.nextCursor).toBeNull();
  });

  it("returns hasMore=true when rows > limit", () => {
    // Simulate fetching limit+1 rows (3 rows for limit=2)
    const items = [
      { id: "a", name: "Alice" },
      { id: "b", name: "Bob" },
      { id: "c", name: "Charlie" },
    ];
    const result = paginationResult(items, 2, 0, "name", (i) => i.name);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(2);
    expect(result.nextCursor).not.toBeNull();

    // Verify cursor encodes the last item of the page (not the overflow item)
    const decoded = decodeCursor(result.nextCursor!);
    expect(decoded!.id).toBe("b");
    expect(decoded!.sortValue).toBe("Bob");
  });

  it("calculates nextOffset correctly with offset > 0", () => {
    const items = [
      { id: "d", name: "Dave" },
      { id: "e", name: "Eve" },
      { id: "f", name: "Frank" },
    ];
    const result = paginationResult(items, 2, 20, "name", (i) => i.name);
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(22);
  });

  it("handles empty result set", () => {
    const result = paginationResult([], 10, 0, "name", () => "");
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBeNull();
    expect(result.nextCursor).toBeNull();
  });
});
