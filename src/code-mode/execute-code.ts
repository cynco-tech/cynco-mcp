/**
 * execute_code — run JavaScript that calls multiple tools in one round-trip.
 */
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SandboxToolHandler } from "./sandbox.js";
import { executeSandbox, validateCode } from "./sandbox.js";
import { successResponse, errorResponse } from "../utils/validation.js";

export const executeCodeSchema = {
  code: z.string().describe(
    "JavaScript code to execute. Use `await cynco.<tool_name>(args)` to call tools. " +
    "Use `console.log()` to output results. Use `search_tools` first to discover available tools and their signatures.",
  ),
};

/**
 * Create the execute_code handler bound to a set of tool handlers.
 */
export function createExecuteCodeHandler(toolHandlers: Map<string, SandboxToolHandler>) {
  return async (args: { code: string }): Promise<CallToolResult> => {
    try {
      // Pre-validation
      const blockReason = validateCode(args.code);
      if (blockReason) {
        return errorResponse(blockReason);
      }

      // Execute in sandbox
      const result = await executeSandbox(args.code, toolHandlers);

      if (result.error) {
        return errorResponse(result.error, {
          output: result.output || undefined,
          toolCalls: result.toolCalls,
          durationMs: result.durationMs,
        });
      }

      return successResponse({
        output: result.output,
        returnValue: result.returnValue,
        toolCalls: result.toolCalls,
        durationMs: result.durationMs,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(msg);
    }
  };
}
