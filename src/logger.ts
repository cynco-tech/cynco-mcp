type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel = LEVELS[(process.env.LOG_LEVEL as LogLevel) || "info"] ?? LEVELS.info;

function write(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  if (LEVELS[level] < minLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...extra,
  };

  // Always write to stderr — stdout is reserved for stdio transport
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const log = {
  debug: (msg: string, extra?: Record<string, unknown>) => write("debug", msg, extra),
  info: (msg: string, extra?: Record<string, unknown>) => write("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => write("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => write("error", msg, extra),
};

/**
 * Create a child logger that includes a request ID in every log line.
 */
export function withRequestId(requestId: string) {
  return {
    debug: (msg: string, extra?: Record<string, unknown>) =>
      write("debug", msg, { requestId, ...extra }),
    info: (msg: string, extra?: Record<string, unknown>) =>
      write("info", msg, { requestId, ...extra }),
    warn: (msg: string, extra?: Record<string, unknown>) =>
      write("warn", msg, { requestId, ...extra }),
    error: (msg: string, extra?: Record<string, unknown>) =>
      write("error", msg, { requestId, ...extra }),
  };
}
