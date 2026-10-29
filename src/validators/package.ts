import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "./common";

export const packageCycleSchema = z
  .object({
    _id: objectIdSchema.optional(),
    name: z.string().trim().min(1).max(100),
    discount_type: z.enum(["percentage", "amount"]).default("percentage"),
    discount: z.number().min(0).default(0),
    price: z.number().min(0),
    months: z.number().int().min(1).max(120),
  })
  .superRefine((cycle, ctx) => {
    if (cycle.discount_type === "percentage" && cycle.discount > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discount"],
        message: "Percentage discount cannot exceed 100",
      });
    }

    if (cycle.discount_type === "amount" && cycle.discount > cycle.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discount"],
        message: "Discount amount cannot be greater than the cycle price",
      });
    }
  });

export const createPackageSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    status: z.boolean().optional(),
    game_id: objectIdSchema,
    teams: z.number().int().min(0).max(10_000).optional(),
    players: z.number().int().min(0).max(10_000).optional(),
    cycles: z.array(packageCycleSchema).min(1, "At least one cycle is required"),
  }),
});

export const updatePackageSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      status: z.boolean().optional(),
      game_id: objectIdSchema.optional(),
      teams: z.number().int().min(0).max(10_000).optional(),
      players: z.number().int().min(0).max(10_000).optional(),
      cycles: z.array(packageCycleSchema).min(1).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listPackagesSchema = z.object({
  query: listQuerySchema,
});
