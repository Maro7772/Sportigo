import { z } from "zod";
import type { RefinementCtx } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

const matchBody = z.object({
  name: z.string().trim().min(2, "Match name is too short").max(150),
  date: z.coerce.date(),
  // `team_id` is kept as a legacy alias for `team1_id`.
  team_id: objectIdSchema.nullish(),
  team1_id: objectIdSchema.nullish(),
  team2_id: objectIdSchema.nullish(),
  opponent_name: z.string().trim().max(150).nullish(),
}).superRefine((data, ctx) => {
  const team1 = data.team1_id ?? data.team_id;
  if (!team1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team1_id"],
      message: "team1_id (or the legacy team_id) is required",
    });
    return;
  }

  if (data.team_id && data.team1_id && data.team_id !== data.team1_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team_id"],
      message: "team_id must match team1_id",
    });
  }

  if (data.team2_id && data.team2_id === team1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team2_id"],
      message: "team1 and team2 must be different teams",
    });
  }
});

export const createMatchSchema = z.object({
  body: matchBody,
});

export const updateMatchSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      name: z.string().trim().min(2).max(150).optional(),
      date: z.coerce.date().optional(),
      team_id: objectIdSchema.nullish(),
      team1_id: objectIdSchema.nullish(),
      team2_id: objectIdSchema.nullish(),
      opponent_name: z.string().trim().max(150).nullish(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});

export const listMatchesSchema = z.object({
  query: listQuerySchema,
});
