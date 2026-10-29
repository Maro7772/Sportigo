import { z } from "zod";
import { idParamSchema, listQuerySchema } from "../common";

export const tenantRoleSchema = z.enum(["admin", "coach", "viewer"]);

const emailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .toLowerCase()
  .email("Invalid email")
  .max(190);

const phoneSchema = z.string().trim().min(5, "Phone is too short").max(30);

export const createTenantAdminSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Name is too short").max(120),
    email: emailSchema,
    phone: phoneSchema.optional().nullable(),
    password: z
      .string({ required_error: "Password is required" })
      .min(6, "Password must be at least 6 characters")
      .max(128),
    role: tenantRoleSchema,
    status: z.boolean().optional(),
  }),
});

export const updateTenantAdminSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      email: emailSchema.optional(),
      phone: phoneSchema.nullable().optional(),
      password: z.string().min(6, "Password must be at least 6 characters").max(128).optional(),
      role: tenantRoleSchema.optional(),
      status: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listTenantAdminsSchema = z.object({
  query: listQuerySchema,
});
