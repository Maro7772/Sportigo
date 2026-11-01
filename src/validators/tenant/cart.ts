import { z } from "zod";
import { objectIdSchema } from "../common";

/** One cart line: the central package + the chosen duration. */
const cartItemBody = z.object({
  package_id: objectIdSchema,
  cycle_id: objectIdSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * `POST /api/tenant/cart` — append one line to the cart.
 * The same package may be added more than once.
 */
export const createCartSchema = z.object({
  body: cartItemBody,
});

/**
 * `PUT|PATCH /api/tenant/cart` — replace the whole cart with this array.
 * An empty array clears the cart.
 */
export const replaceCartSchema = z.object({
  body: z.object({
    items: z.array(cartItemBody).max(20, "A cart can hold at most 20 lines"),
  }),
});

/**
 * `PATCH /api/tenant/cart` — update one line. `package_id` identifies the line
 * (a package can appear only once in the cart).
 */
export const updateCartSchema = z.object({
  body: cartItemBody
    .partial()
    .extend({ package_id: objectIdSchema })
    .refine((data) => Object.keys(data).length > 1, {
      message: "At least one field besides package_id is required",
    }),
});

/** `DELETE /api/tenant/cart?package_id=...` — remove one line (omit to clear all). */
export const deleteCartSchema = z.object({
  query: z.object({
    package_id: objectIdSchema.optional(),
  }),
});

export const checkoutCartSchema = z.object({
  body: z.object({
    payment_method_id: objectIdSchema,
    payment_proof: z.string().trim().max(2000).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
});
