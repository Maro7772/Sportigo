import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "./common";

export const createActionSchema = z.object({
  body: z.object({
    game_id: objectIdSchema,
    name: z.string().trim().min(1).max(100),
    status: z.boolean().optional(),
  }),
});

export const updateActionSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      game_id: objectIdSchema.optional(),
      name: z.string().trim().min(1).max(100).optional(),
      status: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listActionsSchema = z.object({
  query: listQuerySchema,
});
