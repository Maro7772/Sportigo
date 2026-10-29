import type { NextFunction, Request, Response } from "express";
import { SuperAdmin } from "../models/SuperAdmin";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { verifyAccessToken, type SuperAdminRole } from "../utils/jwt";
import { catchAsync } from "../utils/catchAsync";

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * The admin is re-checked in the database so deactivated accounts lose access.
 */
export const authenticate = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedError("No token provided");

    const payload = verifyAccessToken(token);

    const admin = await SuperAdmin.findById(payload.sub).select("email status role");
    if (!admin) throw new UnauthorizedError("Account no longer exists");
    if (!admin.status) throw new UnauthorizedError("Account is inactive");

    req.user = {
      sub: String(admin._id),
      email: admin.email,
      role: "super_admin",
      type: "super_admin",
    };

    next();
  }
);

/** Restricts a route to one or more roles. Use after `authenticate`. */
export function authorize(...roles: SuperAdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError("Unauthorized"));
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError("You do not have permission to do this"));
    }
    next();
  };
}
