import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "./common";

const orderStatusSchema = z.enum([
  "pending",
  "paid",
  "rejected",
  "cancelled",
  "refunded",
]);

const coerceNumber = z.preprocess((val) => {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : val;
}, z.number().min(0).optional());

const notesSchema = z
  .preprocess(
    (val) => (val === "" ? null : val),
    z.string().trim().max(1000).nullable(),
  )
  .optional();

const paidAtSchema = z
  .preprocess((val) => (val === "" ? null : val), z.coerce.date().nullable())
  .optional();

const paymentProofUrlSchema = z
  .preprocess(
    (val) => (val === "" ? null : val),
    z.string().trim().max(2000).nullable(),
  )
  .optional();

export const createOrderSchema = z.object({
  body: z.object({
    club_id: objectIdSchema,
    package_id: objectIdSchema,
    cycle_id: objectIdSchema.optional().nullable(),
    payment_method_id: objectIdSchema,
    price: coerceNumber,
    discount: coerceNumber,
    fine: coerceNumber,
    // 👇 شيلنا status و payment_reference
    payment_proof: paymentProofUrlSchema,
    paid_at: paidAtSchema,
    notes: notesSchema,
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
      price: coerceNumber,
      discount: coerceNumber,
      fine: coerceNumber,
      status: orderStatusSchema.optional(),
      payment_proof: paymentProofUrlSchema,
      paid_at: paidAtSchema,
      notes: notesSchema,
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
      notes: notesSchema,
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
    notes: notesSchema,
  }),
});

export const listOrdersSchema = z.object({
  query: listQuerySchema,
});
