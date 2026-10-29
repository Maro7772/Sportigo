import { z } from "zod";
import { normalizeSubdomain, SUBDOMAIN_PATTERN } from "../utils/helpers";
import { isReservedSubdomain } from "../config/tenant";
import { idParamSchema, listQuerySchema, objectIdSchema } from "./common";

const subdomainSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeSubdomain(value) : value),
  z
    .string()
    .min(2, "Subdomain must be at least 2 characters")
    .max(63, "Subdomain is too long")
    .regex(SUBDOMAIN_PATTERN, "Subdomain may only contain letters, numbers and hyphens")
    .refine((value) => !isReservedSubdomain(value), {
      message: "This subdomain is reserved (it would collide with a system database)",
    })
);

export const createClubSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(150),
      status: z.boolean().optional(),
      subdomain: subdomainSchema,
      package_id: objectIdSchema.optional().nullable(),
      cycle_id: objectIdSchema.optional().nullable(),
      start_date: z.coerce.date().optional().nullable(),
      end_date: z.coerce.date().optional().nullable(),

      // 👇 بقوا إجباريين — الـ super admin بيكتبهم بنفسه
      admin_name: z.string().trim().min(2).max(120),
      admin_email: z.string().trim().toLowerCase().email("Invalid admin email").max(190),
      admin_password: z
        .string()
        .min(6, "Admin password must be at least 6 characters")
        .max(128),
    })
    .refine(
      (data) =>
        !data.start_date || !data.end_date || data.end_date >= data.start_date,
      { message: "end_date must be greater than or equal to start_date", path: ["end_date"] }
    ),
});

export const updateClubSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(150).optional(),
      status: z.boolean().optional(),
      subdomain: subdomainSchema.optional(),
      package_id: objectIdSchema.optional().nullable(),
      cycle_id: objectIdSchema.optional().nullable(),   // 👈 ضفناها (كانت ناقصة)
      start_date: z.coerce.date().optional().nullable(),
      end_date: z.coerce.date().optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listClubsSchema = z.object({
  query: listQuerySchema,
});

/**
 * Super admin recovery: reset a club account's password.
 * Without `admin_id`/`email` the default `admin@<subdomain>.com` is targeted.
 * Without `password` a random one is generated and returned once.
 */
export const resetTenantAdminSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      admin_id: objectIdSchema.optional(),
      email: z.string().trim().toLowerCase().email("Invalid email").max(190).optional(),
      password: z
        .string()
        .min(6, "Password must be at least 6 characters")
        .max(128)
        .optional(),
      /** Re-activate the account in the same call (useful after a lockout). */
      activate: z.boolean().optional(),
    })
    .refine((data) => !(data.admin_id && data.email), {
      message: "Send either admin_id or email, not both",
      path: ["admin_id"],
    })
    .default({}),
});