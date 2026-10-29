import { z } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

/**
 * `game_id` is optional on create: when omitted it is copied from the team,
 * so the stored player always has the right game.
 */
export const createPlayerSchema = z.object({
  body: z.object({
    team_id: objectIdSchema,
    game_id: objectIdSchema.optional(),
    name: z.string().trim().min(2, "Player name is too short").max(120),
    height: z.coerce.number().min(50).max(260),
    weight: z.coerce.number().min(20).max(250),
    age: z.coerce.number().int().min(5).max(70),
  }),
});

export const updatePlayerSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      team_id: objectIdSchema.optional(),
      game_id: objectIdSchema.optional(),
      name: z.string().trim().min(2).max(120).optional(),
      height: z.coerce.number().min(50).max(260).optional(),
      weight: z.coerce.number().min(20).max(250).optional(),
      age: z.coerce.number().int().min(5).max(70).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listPlayersSchema = z.object({
  query: listQuerySchema,
});
