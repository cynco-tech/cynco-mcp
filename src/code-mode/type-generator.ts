/**
 * Converts Zod schemas into TypeScript declaration strings.
 * Used by search_tools to give the LLM type-safe signatures for discovered tools.
 */
import { z } from "zod";

const MAX_DEPTH = 10;

/**
 * Convert a single Zod type to a TypeScript type string.
 */
export function zodToTypeScript(schema: z.ZodTypeAny, depth = 0): string {
  if (depth > MAX_DEPTH) return "unknown";
  const def = schema._def;

  // Unwrap ZodDefault → treat as optional of the inner type
  if (def.typeName === "ZodDefault") {
    return zodToTypeScript(def.innerType as z.ZodTypeAny, depth + 1);
  }

  // Unwrap ZodOptional
  if (def.typeName === "ZodOptional") {
    return zodToTypeScript(def.innerType as z.ZodTypeAny, depth + 1);
  }

  // Unwrap ZodNullable
  if (def.typeName === "ZodNullable") {
    return `${zodToTypeScript(def.innerType as z.ZodTypeAny)} | null`;
  }

  // Primitives
  if (def.typeName === "ZodString") return "string";
  if (def.typeName === "ZodNumber") return "number";
  if (def.typeName === "ZodBoolean") return "boolean";
  if (def.typeName === "ZodNull") return "null";
  if (def.typeName === "ZodUndefined") return "undefined";
  if (def.typeName === "ZodAny") return "unknown";
  if (def.typeName === "ZodUnknown") return "unknown";
  if (def.typeName === "ZodVoid") return "void";
  if (def.typeName === "ZodNever") return "never";
  if (def.typeName === "ZodDate") return "string"; // JSON serialized as string
  if (def.typeName === "ZodLiteral") {
    const val = def.value as unknown;
    return typeof val === "string" ? `"${val}"` : String(val);
  }

  // Enum → string union
  if (def.typeName === "ZodEnum") {
    const values = def.values as string[];
    return values.map((v) => `"${v}"`).join(" | ");
  }

  // NativeEnum
  if (def.typeName === "ZodNativeEnum") {
    const vals = Object.values(def.values as Record<string, string | number>);
    return vals.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(" | ");
  }

  // Array
  if (def.typeName === "ZodArray") {
    const inner = zodToTypeScript(def.type as z.ZodTypeAny, depth + 1);
    // Wrap complex types in parens for readability
    const needsParens = inner.includes("|") || inner.includes("&");
    return needsParens ? `(${inner})[]` : `${inner}[]`;
  }

  // Object
  if (def.typeName === "ZodObject") {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    return objectShapeToTS(shape, depth + 1);
  }

  // Record
  if (def.typeName === "ZodRecord") {
    const valType = zodToTypeScript(def.valueType as z.ZodTypeAny, depth + 1);
    return `Record<string, ${valType}>`;
  }

  // Union
  if (def.typeName === "ZodUnion" || def.typeName === "ZodDiscriminatedUnion") {
    const options = def.options as z.ZodTypeAny[];
    return options.map((o) => zodToTypeScript(o, depth + 1)).join(" | ");
  }

  // Intersection
  if (def.typeName === "ZodIntersection") {
    const left = zodToTypeScript(def.left as z.ZodTypeAny, depth + 1);
    const right = zodToTypeScript(def.right as z.ZodTypeAny, depth + 1);
    return `${left} & ${right}`;
  }

  // Tuple
  if (def.typeName === "ZodTuple") {
    const items = (def.items as z.ZodTypeAny[]).map((i) => zodToTypeScript(i, depth + 1));
    return `[${items.join(", ")}]`;
  }

  // Effects (refinements, transforms) — unwrap to the inner type
  if (def.typeName === "ZodEffects") {
    return zodToTypeScript(def.schema as z.ZodTypeAny, depth + 1);
  }

  // Pipeline — use the input type
  if (def.typeName === "ZodPipeline") {
    return zodToTypeScript(def.in as z.ZodTypeAny, depth + 1);
  }

  // Lazy — resolve and convert
  if (def.typeName === "ZodLazy") {
    const getter = def.getter as () => z.ZodTypeAny;
    return zodToTypeScript(getter(), depth + 1);
  }

  // Branded — unwrap
  if (def.typeName === "ZodBranded") {
    return zodToTypeScript(def.type as z.ZodTypeAny, depth + 1);
  }

  // Catch-all
  return "unknown";
}

/**
 * Check if a Zod schema is optional (ZodOptional or ZodDefault).
 */
function isOptional(schema: z.ZodTypeAny): boolean {
  const typeName = schema._def.typeName as string;
  return typeName === "ZodOptional" || typeName === "ZodDefault";
}

/**
 * Convert an object shape to TypeScript object literal string.
 */
function objectShapeToTS(shape: z.ZodRawShape, depth = 0): string {
  const entries = Object.entries(shape);
  if (entries.length === 0) return "{}";

  const fields = entries.map(([key, zodType]) => {
    const optional = isOptional(zodType);
    const tsType = zodToTypeScript(zodType, depth);
    const desc = zodType.description;
    const descComment = desc ? `/** ${desc} */ ` : "";
    return `${descComment}${key}${optional ? "?" : ""}: ${tsType}`;
  });

  return `{ ${fields.join("; ")} }`;
}

/**
 * Generate a full TypeScript function declaration for a tool.
 */
export function generateToolDeclaration(
  name: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
): string {
  const argsType = objectShapeToTS(inputSchema);
  const jsDoc = `/** ${description.split("\n")[0].replace(/\*\//g, "* /")} */`;
  return `${jsDoc}\n  function ${name}(args: ${argsType}): Promise<ToolResult>;`;
}

/**
 * Generate a namespace declaration block for a set of tools.
 */
export function generateDeclarationsBlock(
  tools: Array<{ name: string; description: string; inputSchema: Record<string, z.ZodTypeAny> }>,
): string {
  const lines = [
    "interface ToolResult { success: boolean; data?: unknown; error?: string }",
    "",
    "declare namespace cynco {",
  ];

  for (const tool of tools) {
    lines.push(`  ${generateToolDeclaration(tool.name, tool.description, tool.inputSchema)}`);
  }

  lines.push("}");
  return lines.join("\n");
}
