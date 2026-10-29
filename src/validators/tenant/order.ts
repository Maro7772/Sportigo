import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

export const purchaseOrderSchema = z.object({
  body: z.object({
    package_id: objectIdSchema,
    cycle_id: objectIdSchema.optional(),
    payment_method_id: objectIdSchema,
    payment_reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const listTenantOrdersSchema = z.object({
  query: listQuerySchema.extend({
    status: z.enum(["pending", "paid", "rejected", "cancelled", "refunded"]).optional(),
  }),
});

export const invoiceParamSchema = idParamSchema.extend({
  query: z.object({
    format: z.enum(["json", "html"]).optional(),
  }).optional(),
});
