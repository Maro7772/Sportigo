import { z } from "zod";
import { idParamSchema, listQuerySchema } from "./common";

/**
 * In `multipart/form-data` all values arrive as strings.
 * `coerceBoolean` normalizes "true"/"false"/"1"/"0"/"yes"/"no"/"on"/"off" → boolean.
 */
const coerceBoolean = z.preprocess((val) => {
  if (val === undefined || val === null || val === "") return undefined;
  if (typeof val === "boolean") return val;
  const s = String(val).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return val;
}, z.boolean().optional());

/**
 * `icon` may come as:
 *  - a real file (handled by multer → `req.files.icon`) → not present in `req.body`
 *  - a string URL                 → use as-is
 *  - the literal string "null" or "" → clear the icon (null)
 */
const iconFieldOptional = z.preprocess(
  (val) => {
    if (val === undefined) return undefined;
    if (val === null) return null;
    if (typeof val === "string") {
      const s = val.trim();
      if (s === "" || s.toLowerCase() === "null") return null;
      return s;
    }
    return val;
  },
  z.union([z.string().max(500), z.null()]).optional(),
);

// في الـ Create، الـ icon إجباري (سواء ملف أو URL)
const iconFieldRequired = z.preprocess(
  (val) => {
    if (val === null) return null;
    if (typeof val === "string") {
      const s = val.trim();
      if (s === "" || s.toLowerCase() === "null") return null;
      return s;
    }
    return val;
  },
  z.union([z.string().max(500), z.null()], {
    required_error: "Icon is required",
    invalid_type_error: "Icon must be a string or a file",
  }),
);

export const createPaymentMethodSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    status: coerceBoolean,
    description: z
      .preprocess(
        (val) => (val === "" ? null : val),
        z.string().trim().max(1000).nullable(),
      )
      .optional(),
    icon: iconFieldOptional, // 👈 إجباري
  }),
});

export const updatePaymentMethodSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    status: coerceBoolean,
    description: z
      .preprocess(
        (val) => (val === "" ? null : val),
        z.string().trim().max(1000).nullable(),
      )
      .optional(),
    icon: iconFieldOptional, // 👈 اختياري
  }),
});

export const listPaymentMethodsSchema = z.object({
  query: listQuerySchema,
});
