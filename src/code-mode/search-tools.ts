/**
 * search_tools — discover tools and get TypeScript signatures.
 */
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateDeclarationsBlock } from "./type-generator.js";
import { successResponse, errorResponse } from "../utils/validation.js";

export interface ToolRegistryEntry {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

const MAX_RESULTS = 25;

export const searchToolsSchema = {
  query: z.string().describe("Search query — matches tool names, descriptions, and categories"),
  category: z.string().optional().describe("Filter by category (e.g. 'accounting', 'invoicing', 'customers')"),
  includeDeclarations: z.boolean().optional().default(true).describe("Include TypeScript declarations for matched tools (default true)"),
};

/**
 * Create the search_tools handler bound to a tool registry.
 */
export function createSearchToolsHandler(registry: ToolRegistryEntry[]) {
  return async (args: {
    query: string;
    category?: string;
    includeDeclarations?: boolean;
  }): Promise<CallToolResult> => {
    try {
      const query = args.query.toLowerCase().trim();
      if (!query && !args.category) {
        return errorResponse("Either 'query' or 'category' must be provided.");
      }

      let candidates = registry;

      // Filter by category first if provided
      if (args.category) {
        const cat = args.category.toLowerCase();
        candidates = candidates.filter((t) => t.category.toLowerCase() === cat);
      }

      // Score and rank by query relevance
      const queryWords = query ? query.split(/\s+/).filter((w) => w.length >= 2) : [];
      const scored = candidates.map((tool) => {
        let score = 0;
        const name = tool.name.toLowerCase();
        const desc = tool.description.toLowerCase();
        const cat = tool.category.toLowerCase();

        if (!query) {
          score = 1; // category-only filter, equal rank
        } else {
          // Exact name match
          if (name === query) score += 100;
          // Name starts with query
          else if (name.startsWith(query)) score += 80;
          // Name contains query (any word)
          else if (name.includes(query)) score += 60;
          // Category matches query
          if (cat === query || cat.includes(query)) score += 30;
          // Description contains query
          if (desc.includes(query)) score += 20;
          // Individual query words match
          for (const word of queryWords) {
            if (name.includes(word)) score += 15;
            if (desc.includes(word)) score += 5;
          }
        }

        return { tool, score };
      });

      // Filter out zero-score results and sort by score descending
      const matched = scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_RESULTS)
        .map((s) => s.tool);

      const includeDecl = args.includeDeclarations !== false;

      const result: Record<string, unknown> = {
        tools: matched.map((t) => ({
          name: t.name,
          category: t.category,
          description: t.description.split("\n")[0], // First line only for compact results
        })),
        totalAvailable: registry.length,
      };

      if (includeDecl && matched.length > 0) {
        result.declarations = generateDeclarationsBlock(matched);
      }

      return successResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(msg);
    }
  };
}

/**
 * Derive category from tool name using scope-map conventions.
 */
export function deriveCategory(toolName: string, scope: string): string {
  // Use the module portion of the scope (e.g. "accounting:read" → "accounting")
  const colonIdx = scope.indexOf(":");
  if (colonIdx > 0) return scope.slice(0, colonIdx);
  // Fallback: first segment of tool name
  const parts = toolName.split("_");
  return parts[0] === "get" || parts[0] === "create" || parts[0] === "update" || parts[0] === "delete"
    ? parts[1] || "general"
    : parts[0] || "general";
}
