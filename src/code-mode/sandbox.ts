/**
 * Sandboxed JavaScript execution using node:vm.
 * Provides a secure context where the only external access is through the `cynco` proxy.
 */
import * as vm from "node:vm";
import { log } from "../logger.js";

const CODE_TIMEOUT_MS = parseInt(process.env.MCP_CODE_TIMEOUT_MS || "60000", 10);
const MAX_OUTPUT_CHARS = 50_000;
const MAX_SCRIPT_LENGTH = 10_000;
const MAX_TOOL_CALLS = 50;

export interface SandboxToolHandler {
  (args: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
}

export interface SandboxResult {
  output: string;
  returnValue: unknown;
  toolCalls: number;
  durationMs: number;
  error?: string;
}

/**
 * Execute user-provided JavaScript code in a sandboxed vm.Context.
 *
 * The context exposes:
 * - `cynco` — a proxy mapping tool names to tenant-scoped handlers
 * - `console.log` — captured to output buffer
 *
 * Explicitly excluded: process, require, import, fetch, setTimeout, eval, Function, globalThis.
 */
export async function executeSandbox(
  code: string,
  toolHandlers: Map<string, SandboxToolHandler>,
): Promise<SandboxResult> {
  const startTime = Date.now();

  // Pre-validation
  if (code.length > MAX_SCRIPT_LENGTH) {
    return {
      output: "",
      returnValue: undefined,
      toolCalls: 0,
      durationMs: Date.now() - startTime,
      error: `Script too long: ${code.length} characters (max ${MAX_SCRIPT_LENGTH}).`,
    };
  }

  // Output capture
  let outputChars = 0;
  const outputLines: string[] = [];
  const captureLog = (...args: unknown[]) => {
    const line = args.map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a, null, 2); } catch { return String(a); }
    }).join(" ");

    if (outputChars < MAX_OUTPUT_CHARS) {
      const remaining = MAX_OUTPUT_CHARS - outputChars;
      if (line.length <= remaining) {
        outputLines.push(line);
        outputChars += line.length + 1; // +1 for newline
      } else {
        outputLines.push(line.slice(0, remaining) + "...[truncated]");
        outputChars = MAX_OUTPUT_CHARS;
      }
    }
  };

  // Tool call tracking
  let toolCallCount = 0;

  // Build cynco proxy
  const cyncoProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      const handler = toolHandlers.get(prop);
      if (!handler) {
        return async () => ({
          success: false,
          error: `Unknown tool: ${prop}. Use search_tools to discover available tools.`,
        });
      }
      return async (args: Record<string, unknown> = {}) => {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS) {
          return {
            success: false,
            error: `Tool call limit reached (${MAX_TOOL_CALLS}). Break your script into smaller steps.`,
          };
        }
        try {
          return await handler(args);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { success: false, error: msg };
        }
      };
    },
    has() { return true; }, // Allow `"toolName" in cynco` checks
  });

  // Sandbox context — only cynco + console
  const context = vm.createContext(
    {
      cynco: cyncoProxy,
      console: { log: captureLog, warn: captureLog, error: captureLog, info: captureLog },
    },
    {
      codeGeneration: { strings: false, wasm: false },
    },
  );

  try {
    const wrappedCode = `(async () => {\n${code}\n})()`;
    const script = new vm.Script(wrappedCode, {
      filename: "code-mode-script.js",
    });

    // Run with timeout — Promise.race handles async portion
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`Script timed out after ${CODE_TIMEOUT_MS}ms`)), CODE_TIMEOUT_MS);
      timeoutHandle.unref();
    });

    try {
      const result = await Promise.race([
        script.runInContext(context, { timeout: CODE_TIMEOUT_MS }),
        timeoutPromise,
      ]);

      return {
        output: outputLines.join("\n"),
        returnValue: sanitizeReturnValue(result),
        toolCalls: toolCallCount,
        durationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("Sandbox execution error", { error: message, toolCalls: toolCallCount });

    return {
      output: outputLines.join("\n"),
      returnValue: undefined,
      toolCalls: toolCallCount,
      durationMs: Date.now() - startTime,
      error: message,
    };
  }
}

/**
 * Ensure the return value is JSON-serializable.
 */
function sanitizeReturnValue(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

/**
 * Blocked patterns — belt-and-suspenders on top of the sandbox's restricted context.
 * These produce clear error messages for common mistake patterns.
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\bprocess\s*\./, message: "'process' is not available in the sandbox." },
  { pattern: /\brequire\s*\(/, message: "'require()' is not available. Use cynco.* tools instead." },
  { pattern: /\bimport\s*\(/, message: "Dynamic 'import()' is not available. Use cynco.* tools instead." },
  { pattern: /\beval\s*\(/, message: "'eval()' is not available in the sandbox." },
  { pattern: /\bFunction\s*\(/, message: "'Function()' constructor is not available in the sandbox." },
];

/**
 * Pre-validate code before sandbox execution.
 * Returns error message if blocked, null if OK.
 */
export function validateCode(code: string): string | null {
  for (const { pattern, message } of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return message;
    }
  }
  return null;
}
