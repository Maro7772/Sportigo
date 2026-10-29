import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

export const createProgressSchema = z.object({
  body: z.object({
    match_id: objectIdSchema,
    action_id: objectIdSchema,
    player_id: objectIdSchema,
  }),
});

export const updateProgressSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      match_id: objectIdSchema.optional(),
      action_id: objectIdSchema.optional(),
      player_id: objectIdSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listProgressSchema = z.object({
  query: listQuerySchema,
});
