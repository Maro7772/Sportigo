import { z } from "zod";

export const updateSettingsSchema = z.object({
  body: z
    .object({
      allowed_days: z.number().int().min(0).max(365).optional(),
      notification: z.boolean().optional(),
      fines: z.number().min(0).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});
