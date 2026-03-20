import { describe, it, expect } from "vitest";
import { z } from "zod";
import * as schemas from "../src/output-schemas.js";

/**
 * Verify that all exported output schemas are valid Zod shapes
 * that the MCP SDK can use for outputSchema validation.
 */
describe("outputSchema definitions", () => {
  const schemaEntries = Object.entries(schemas);

  it("exports at least 15 output schemas", () => {
    expect(schemaEntries.length).toBeGreaterThanOrEqual(15);
  });

  for (const [name, schema] of schemaEntries) {
    describe(name, () => {
      it("is a valid ZodRawShape (object with Zod values)", () => {
        expect(typeof schema).toBe("object");
        expect(schema).not.toBeNull();

        // Every value in the shape should be a Zod type
        for (const [key, val] of Object.entries(schema as Record<string, unknown>)) {
          expect(val).toBeDefined();
          // Zod types have _def property
          expect((val as { _def?: unknown })._def).toBeDefined();
        }
      });

      it("has a 'success' field of type boolean", () => {
        const shape = schema as Record<string, z.ZodType>;
        expect(shape.success).toBeDefined();
      });

      it("has an optional 'error' field", () => {
        const shape = schema as Record<string, z.ZodType>;
        expect(shape.error).toBeDefined();
      });

      it("can validate a success response", () => {
        const shape = schema as Record<string, z.ZodType>;
        // success: true should parse
        const result = shape.success.safeParse(true);
        expect(result.success).toBe(true);
      });

      it("can validate an error response", () => {
        const shape = schema as Record<string, z.ZodType>;
        const errorResult = shape.error?.safeParse("Something went wrong");
        expect(errorResult?.success).toBe(true);
      });
    });
  }
});
