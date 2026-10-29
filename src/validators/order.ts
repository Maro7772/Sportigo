import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "./common";

const orderStatusSchema = z.enum([
  "pending",
  "paid",
  "rejected",
  "cancelled",
  "refunded",
]);

const paymentProofSchema = z.string().trim().max(2000).optional().nullable();
const paymentReferenceSchema = z.string().trim().max(200).optional().nullable();

export const createOrderSchema = z.object({
  body: z.object({
    club_id: objectIdSchema,
    package_id: objectIdSchema,
    cycle_id: objectIdSchema.optional().nullable(),
    payment_method_id: objectIdSchema,
    price: z.number().min(0).optional(),
    discount: z.number().min(0).optional(),
    fine: z.number().min(0).optional(),
    status: orderStatusSchema.optional(),
    payment_proof: paymentProofSchema,
    payment_reference: paymentReferenceSchema,
    paid_at: z.coerce.date().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  }),
});

export const updateOrderSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      club_id: objectIdSchema.optional(),
      package_id: objectIdSchema.optional(),
      cycle_id: objectIdSchema.optional().nullable(),
      payment_method_id: objectIdSchema.optional(),
      price: z.number().min(0).optional(),
      discount: z.number().min(0).optional(),
      fine: z.number().min(0).optional(),
      status: orderStatusSchema.optional(),
      payment_proof: paymentProofSchema,
      payment_reference: paymentReferenceSchema,
      paid_at: z.coerce.date().optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const updateOrderStatusSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({ status: orderStatusSchema }),
});

export const approveOrderSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      notes: z.string().trim().max(1000).optional().nullable(),
    })
    .default({}),
});

export const rejectOrderSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({
    reason: z
      .string({ required_error: "Rejection reason is required" })
      .trim()
      .min(3, "Rejection reason must be at least 3 characters")
      .max(1000),
    notes: z.string().trim().max(1000).optional().nullable(),
  }),
});

export const listOrdersSchema = z.object({
  query: listQuerySchema,
});
