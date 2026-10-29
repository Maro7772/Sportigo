import { z } from "zod";
import type { RefinementCtx } from "zod";
import { idParamSchema, listQuerySchema, objectIdSchema } from "../common";

interface MatchShape {
  team_id?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
}

function validateTeams(data: MatchShape, ctx: RefinementCtx): void {
  const single = Boolean(data.team_id);
  const pair = Boolean(data.team1_id) || Boolean(data.team2_id);

  if (single && pair) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team_id"],
      message: "Use either team_id or team1_id + team2_id, not both",
    });
    return;
  }

  if (pair && (!data.team1_id || !data.team2_id)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team2_id"],
      message: "team1_id and team2_id are both required",
    });
    return;
  }

  if (pair && data.team1_id === data.team2_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team2_id"],
      message: "team1_id and team2_id must be different",
    });
    return;
  }

  if (!single && !pair) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["team_id"],
      message: "Provide team_id, or team1_id + team2_id when both teams are on the platform",
    });
  }
}

const matchBody = z.object({
  name: z.string().trim().min(2, "Match name is too short").max(150),
  date: z.coerce.date(),
  team_id: objectIdSchema.nullish(),
  team1_id: objectIdSchema.nullish(),
  team2_id: objectIdSchema.nullish(),
  opponent_name: z.string().trim().max(150).nullish(),
});

export const createMatchSchema = z.object({
  body: matchBody.superRefine(validateTeams),
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
    })
    .superRefine((data, ctx) => {
      // Only the fields present in the payload are checked here; the model
      // validates the merged document.
      if (data.team_id && (data.team1_id || data.team2_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["team_id"],
          message: "Use either team_id or team1_id + team2_id, not both",
        });
      }

      if ((data.team1_id || data.team2_id) && !(data.team1_id && data.team2_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["team2_id"],
          message: "team1_id and team2_id are both required",
        });
      }
    }),
});

export const listMatchesSchema = z.object({
  query: listQuerySchema,
});
