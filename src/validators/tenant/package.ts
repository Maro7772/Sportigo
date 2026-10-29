import { z } from "zod";
import { objectIdSchema } from "../common";

export const listTenantPackagesSchema = z.object({
  query: z.object({
    game_id: objectIdSchema.optional(),
    search: z.string().trim().max(120).optional(),
  }),
});
