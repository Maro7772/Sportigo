import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

export const createCartSchema = z.object({
  body: z.object({
    package_id: objectIdSchema,
    cycle_id: objectIdSchema.optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});

export const updateCartSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      package_id: objectIdSchema.optional(),
      cycle_id: objectIdSchema.optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listCartSchema = z.object({
  query: listQuerySchema,
});

export const checkoutCartSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({
    payment_method_id: objectIdSchema,
    payment_reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});
