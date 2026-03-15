import { z } from "zod";
import type pg from "pg";
import { query, withTransaction } from "../db.js";
import { generateId } from "../utils/typeid.js";
import {
  resolveTenant,
  tenantWhere,
  validateTypeId,
  successResponse,
  errorResponse,
} from "../utils/validation.js";

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().min(0),
  unitPrice: z.number(),
  taxRate: z.number().optional(),
  taxCode: z.string().optional(),
});

export const createInvoiceSchema = {
  clientId: z.string().optional().describe("Client ID (XOR with accountingFirmId)"),
  accountingFirmId: z.string().optional().describe("Accounting firm ID (XOR with clientId)"),
  customerId: z.string().describe("Customer ID"),
  lineItems: z
    .array(lineItemSchema)
    .min(1)
    .describe("Invoice line items (at least 1)"),
  dueDate: z.string().optional().describe("Due date (YYYY-MM-DD)"),
  paymentTerms: z.string().optional().describe("Payment terms (e.g. Net 30)"),
  currency: z.string().optional().default("MYR").describe("Currency code (default MYR)"),
  memo: z.string().optional().describe("Internal memo or notes"),
  createdBy: z.string().describe("User ID of the creator"),
};

export async function createInvoice(args: {
  clientId?: string;
  accountingFirmId?: string;
  customerId: string;
  lineItems: z.infer<typeof lineItemSchema>[];
  dueDate?: string;
  paymentTerms?: string;
  currency?: string;
  memo?: string;
  createdBy: string;
}) {
  try {
    const tenant = resolveTenant(args);
    validateTypeId(args.customerId, "cust", "customerId");
    validateTypeId(args.createdBy, "usr", "createdBy");

    return await withTransaction(async (client: pg.PoolClient) => {
      // Verify user exists
      const userResult = await client.query(
        `SELECT id FROM users WHERE id = $1`,
        [args.createdBy],
      );
      if (userResult.rows.length === 0) {
        return errorResponse(
          `User not found: ${args.createdBy}. createdBy must reference a valid user ID.`,
        );
      }

      // Verify customer exists and belongs to tenant
      const custTw = tenantWhere(tenant, 2);
      const custResult = await client.query(
        `SELECT id, name, email, address, city, state, zip, country, phone
         FROM customers
         WHERE id = $1 AND ${custTw.sql} AND is_archived = false`,
        [args.customerId, ...custTw.params],
      );
      if (custResult.rows.length === 0) {
        return errorResponse(
          "Customer not found, archived, or does not belong to this tenant.",
        );
      }

      const customer = custResult.rows[0];
      const customerName = customer.name as string;
      const customerEmail = (customer.email ?? "") as string;

      // Get company details based on tenant type
      let companyName: string | null = null;
      let companyAddress: string | null = null;
      let companyCity: string | null = null;
      let companyState: string | null = null;
      let companyZip: string | null = null;
      let companyCountry: string | null = null;

      if (tenant.clientId) {
        const compResult = await client.query(
          `SELECT company_name, address, city, state, zip, country
           FROM client_details
           WHERE client_id = $1
           LIMIT 1`,
          [tenant.clientId],
        );
        if (compResult.rows.length > 0) {
          const comp = compResult.rows[0];
          companyName = comp.company_name as string | null;
          companyAddress = comp.address as string | null;
          companyCity = comp.city as string | null;
          companyState = comp.state as string | null;
          companyZip = comp.zip as string | null;
          companyCountry = comp.country as string | null;
        }
      } else {
        const compResult = await client.query(
          `SELECT company_name, address, city, state, zip, country
           FROM accounting_firm_details
           WHERE accounting_firm_id = $1
           LIMIT 1`,
          [tenant.accountingFirmId],
        );
        if (compResult.rows.length > 0) {
          const comp = compResult.rows[0];
          companyName = comp.company_name as string | null;
          companyAddress = comp.address as string | null;
          companyCity = comp.city as string | null;
          companyState = comp.state as string | null;
          companyZip = comp.zip as string | null;
          companyCountry = comp.country as string | null;
        }
      }

      // Calculate line item amounts
      const calculatedLineItems = args.lineItems.map((item) => {
        const amount = item.quantity * item.unitPrice;
        const taxRate = item.taxRate ?? 0;
        const taxAmount = amount * (taxRate / 100);
        return {
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: parseFloat(amount.toFixed(2)),
          taxRate,
          taxCode: item.taxCode ?? null,
          taxAmount: parseFloat(taxAmount.toFixed(2)),
        };
      });

      const subtotal = calculatedLineItems.reduce((sum, item) => sum + item.amount, 0);
      const totalTaxes = calculatedLineItems.reduce((sum, item) => sum + item.taxAmount, 0);
      const totalAmount = subtotal + totalTaxes;

      // Generate invoice number with advisory lock for sequence safety
      // Lock key is derived from tenant ID to scope the sequence per tenant
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext($1 || '-invoice-number'))`,
        [tenant.value],
      );

      const year = new Date().getFullYear();
      const pattern = `INV-${year}-%`;

      const invTw = tenantWhere(tenant, 2);
      const maxResult = await client.query(
        `SELECT MAX(invoice_number) as max_number FROM invoices
         WHERE ${invTw.sql} AND invoice_number LIKE $${invTw.nextParam}`,
        [...invTw.params, pattern],
      );

      let nextSeq = 1;
      if (maxResult.rows[0]?.max_number) {
        const parts = (maxResult.rows[0].max_number as string).split("-");
        const lastPart = parts[parts.length - 1];
        const parsed = parseInt(lastPart, 10);
        if (!isNaN(parsed)) {
          nextSeq = parsed + 1;
        }
      }

      const invoiceNumber = `INV-${year}-${String(nextSeq).padStart(4, "0")}`;
      const invoiceId = generateId("inv");
      const currency = args.currency ?? "MYR";

      await client.query(
        `INSERT INTO invoices (
          id, client_id, accounting_firm_id,
          customer_id, customer_name, customer_email,
          address, city, state, zip, country, phone,
          company_name, company_address, company_city, company_state, company_zip, company_country,
          line_items, taxes, total_amount,
          status, due_date, payment_terms,
          invoice_number, currency, memo,
          user_id, is_archived,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21,
          $22, $23, $24,
          $25, $26, $27,
          $28, $29,
          NOW(), NOW()
        )`,
        [
          invoiceId,
          tenant.clientId,
          tenant.accountingFirmId,
          args.customerId,
          customerName,
          customerEmail,
          customer.address ?? null,
          customer.city ?? null,
          customer.state ?? null,
          customer.zip ?? null,
          customer.country ?? null,
          customer.phone ?? null,
          companyName,
          companyAddress,
          companyCity,
          companyState,
          companyZip,
          companyCountry,
          JSON.stringify(calculatedLineItems),
          totalTaxes.toFixed(2),
          totalAmount.toFixed(2),
          "draft",
          args.dueDate ?? null,
          args.paymentTerms ?? null,
          invoiceNumber,
          currency,
          args.memo ?? null,
          args.createdBy,
          false,
        ],
      );

      return successResponse({
        id: invoiceId,
        invoiceNumber,
        status: "draft",
        customerId: args.customerId,
        customerName,
        customerEmail,
        currency,
        lineItems: calculatedLineItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        taxes: parseFloat(totalTaxes.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        dueDate: args.dueDate ?? null,
        paymentTerms: args.paymentTerms ?? null,
        memo: args.memo ?? null,
        createdAt: new Date().toISOString(),
      });
    });
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
