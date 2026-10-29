import { z } from "zod";

const passwordSchema = z
  .string({ required_error: "Password is required" })
  .min(6, "Password must be at least 6 characters")
  .max(128);

/**
 * The club admin logs in on its own subdomain (`ahly.example.com`).
 * `email` or `phone` is accepted, or a generic `identifier` (email or phone).
 */
export const tenantLoginSchema = z.object({
  body: z
    .object({
      email: z.string().trim().max(190).optional(),
      phone: z.string().trim().max(30).optional(),
      identifier: z.string().trim().max(190).optional(),
      password: z.string({ required_error: "Password is required" }).min(1, "Password is required"),
    })
    .refine((data) => Boolean(data.email || data.phone || data.identifier), {
      message: "email or phone is required",
      path: ["email"],
    }),
});

export const tenantChangePasswordSchema = z.object({
  body: z.object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: passwordSchema,
  }),
});
