import { z } from "zod";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgb|rgba|hsl|hsla)\([^)]*\)$/i;

const colorSchema = z
  .string()
  .trim()
  .max(50)
  .refine((value) => HEX.test(value) || FUNCTIONAL.test(value), {
    message: "Color must be a hex value (#16a34a) or rgb()/hsl()",
  });

export const updateTenantSettingsSchema = z.object({
  body: z
    .object({
      logo: z.string().trim().max(2000).nullable().optional(),
      background_color: z.array(colorSchema).max(20).optional(),
      color: z.array(colorSchema).max(20).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field is required",
    }),
});
