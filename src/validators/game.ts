import { z } from "zod";
import { idParamSchema, listQuerySchema } from "./common";

export const createGameSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    status: z.boolean().optional(),
  }),
});

export const updateGameSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      status: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listGamesSchema = z.object({
  query: listQuerySchema,
});
