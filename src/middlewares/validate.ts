import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AnyZodObject, ZodEffects } from "zod";
import { ZodError } from "zod";

type Schema = AnyZodObject | ZodEffects<AnyZodObject>;

/**
 * Validates `body`, `query` and `params` against a Zod schema.
 * Parsed body/params are written back so defaults and coercions apply.
 */
export function validate(schema: Schema): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.params !== undefined) Object.assign(req.params, parsed.params);

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(error);
      }
      next(error);
    }
  };
}
