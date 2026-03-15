import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, withRequestId } from "../src/logger.js";

describe("logger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("writes JSON to stderr", () => {
    log.info("test message");
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test message");
    expect(parsed.ts).toBeDefined();
  });

  it("includes extra fields", () => {
    log.warn("warning", { code: 42, detail: "something" });
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.code).toBe(42);
    expect(parsed.detail).toBe("something");
  });

  it("writes all log levels", () => {
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    // debug may be filtered by LOG_LEVEL; at least info/warn/error should write
    expect(stderrSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("withRequestId", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("includes requestId in every log line", () => {
    const rlog = withRequestId("req-abc-123");
    rlog.info("scoped log");
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.requestId).toBe("req-abc-123");
    expect(parsed.msg).toBe("scoped log");
  });

  it("merges extra fields with requestId", () => {
    const rlog = withRequestId("req-xyz");
    rlog.error("fail", { tool: "get_invoices" });
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.requestId).toBe("req-xyz");
    expect(parsed.tool).toBe("get_invoices");
  });
});
