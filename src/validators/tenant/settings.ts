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

const colorList = z.preprocess((value) => {
  // multipart/form-data sends every field as a string: accept a JSON array
  // (`["#fff","#000"]`) or a comma separated list (`#fff,#000`).
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}, z.array(colorSchema).max(20).optional());

export const updateTenantSettingsSchema = z.object({
  body: z.object({
    logo: z.string().trim().max(2000).nullable().optional(),
    background_color: colorList,
    color: colorList,
  }),
});
