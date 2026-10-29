import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

export const createTeamSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Team name is too short").max(120),
    game_id: objectIdSchema,
  }),
});

export const updateTeamSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      game_id: objectIdSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listTeamsSchema = z.object({
  query: listQuerySchema,
});
