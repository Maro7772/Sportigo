import { z } from "zod";
import { idParamSchema, listQuerySchema } from "./common";

export const createPaymentMethodSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    status: z.boolean().optional(),
    description: z.string().trim().max(1000).optional().nullable(),
  }),
});

export const updatePaymentMethodSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      status: z.boolean().optional(),
      description: z.string().trim().max(1000).optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listPaymentMethodsSchema = z.object({
  query: listQuerySchema,
});
