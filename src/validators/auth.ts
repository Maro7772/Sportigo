import { z } from "zod";

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string({ required_error: "Email is required" })
      .trim()
      .toLowerCase()
      .email("Invalid email"),
    password: z
      .string({ required_error: "Password is required" })
      .min(1, "Password is required"),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      current_password: z.string().min(1, "Current password is required"),
      new_password: z
        .string()
        .min(6, "New password must be at least 6 characters")
        .max(72, "New password is too long"),
      confirm_password: z.string().optional(),
    })
    .refine(
      (data) => !data.confirm_password || data.confirm_password === data.new_password,
      { message: "Passwords do not match", path: ["confirm_password"] }
    ),
});
