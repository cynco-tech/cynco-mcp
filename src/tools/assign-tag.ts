import { z } from "zod";
import type pg from "pg";
import { withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";
import { tenantSchema } from "../utils/tools.js";

export const assignTagSchema = {
  ...tenantSchema,
  tagId: z.string().describe("Tag ID to assign"),
  entityId: z.string().describe("Entity ID to tag (customer, vendor, invoice, bill, etc.)"),
  entityType: z.enum(["vendor", "customer", "invoice", "bill", "quotation", "purchase_order"]).describe("Entity type"),
  createdBy: z.string().describe("User ID"),
};

export async function assignTag(args: {
  clientId?: string;
  accountingFirmId?: string;
  tagId: string;
  entityId: string;
  entityType: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.tagId, "tag", "tagId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify tag exists and belongs to tenant
      const tw = tenantWhere(tenant, 2);
      const tagResult = await client.query(
        `SELECT id, name FROM tags WHERE id = $1 AND ${tw.sql}`,
        [args.tagId, ...tw.params],
      );
      if (tagResult.rows.length === 0) {
        return errorResponse("Tag not found or does not belong to this tenant.");
      }

      // Verify entity exists and belongs to tenant
      const ENTITY_TABLES: Record<string, string> = {
        customer: "customers",
        vendor: "vendors",
        invoice: "invoices",
        bill: "bills",
        quotation: "quotations",
        purchase_order: "purchase_orders",
      };
      const entityTable = ENTITY_TABLES[args.entityType];
      if (!entityTable) {
        return errorResponse(`Unsupported entity type: ${args.entityType}`);
      }
      const entityTw = tenantWhere(tenant, 2);
      const entityCheck = await client.query(
        `SELECT id FROM ${entityTable} WHERE id = $1 AND ${entityTw.sql}`,
        [args.entityId, ...entityTw.params],
      );
      if (entityCheck.rows.length === 0) {
        return errorResponse("Entity not found or does not belong to this tenant.");
      }

      // Check for duplicate assignment
      const dupTw = tenantWhere(tenant, 4);
      const dupResult = await client.query(
        `SELECT id FROM entity_tags WHERE tag_id = $1 AND entity_id = $2 AND entity_type = $3 AND ${dupTw.sql}`,
        [args.tagId, args.entityId, args.entityType, ...dupTw.params],
      );
      if (dupResult.rows.length > 0) {
        return errorResponse(`Tag "${tagResult.rows[0].name}" is already assigned to this entity.`);
      }

      const entityTagId = generateId("etag");
      await client.query(
        `INSERT INTO entity_tags (id, tag_id, entity_id, entity_type, client_id, accounting_firm_id, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [entityTagId, args.tagId, args.entityId, args.entityType,
         tenant.clientId, tenant.accountingFirmId, args.createdBy],
      );

      return successResponse({
        id: entityTagId,
        tagId: args.tagId,
        tagName: tagResult.rows[0].name,
        entityId: args.entityId,
        entityType: args.entityType,
      });
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
}
