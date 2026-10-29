import type { NextFunction, Request, Response } from "express";
import { NotFound } from "../errors";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new NotFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
