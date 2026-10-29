import { z } from "zod";

export const objectIdSchema = z
  .string({ required_error: "ID is required" })
  .regex(/^[a-f\d]{24}$/i, "Invalid ID");

export const idParamSchema = z.object({
  params: z.object({ id: objectIdSchema }),
});

export const bulkDeleteSchema = z.object({
  body: z.object({
    ids: z
      .array(objectIdSchema, { required_error: "ids array is required" })
      .min(1, "At least one ID is required"),
  }),
});

export const listQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    search: z.string().trim().optional(),
    sort_by: z.string().trim().optional(),
    order: z.enum(["asc", "desc"]).optional(),
    status: z.string().trim().optional(),
  })
  .passthrough();
