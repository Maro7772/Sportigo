import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { verifyTenantToken } from "../utils/tenantJwt";
import { catchAsync } from "../utils/catchAsync";
import { tenantContext, tenantModels } from "./tenant";
import type { TenantRole } from "../models/tenant";

export interface TenantAuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: TenantRole;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * Requires a valid tenant token (`Authorization: Bearer <token>`).
 *
 * Besides verifying the signature, it:
 * - rejects tokens issued for another club (a token from `ahly` cannot open
 *   `zamalek`, even though both databases have an `admin` collection),
 * - re-reads the admin from the club's own database on every request, so a
 *   deleted/deactivated account loses access immediately.
 */
export const tenantAuthenticate = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("No token provided");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) throw new UnauthorizedError("No token provided");

    const payload = verifyTenantToken(token);
    const { subdomain } = tenantContext(req);

    if (payload.club !== subdomain) {
      throw new ForbiddenError("This token was issued for another club");
    }

    if (!OBJECT_ID.test(payload.sub)) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const admin = await tenantModels(req).Admin.findById(payload.sub);
    if (!admin) throw new UnauthorizedError("Account no longer exists");
    if (!admin.status) {
      throw new UnauthorizedError("Your account is inactive. Please contact the club administrator.");
    }

    // A password reset/change increments the version and revokes older tokens.
    if ((payload.password_version ?? 0) !== (admin.password_version ?? 0)) {
      throw new UnauthorizedError("Password was changed. Please log in again.");
    }

    req.tenantUser = {
      id: String(admin._id),
      name: admin.name,
      email: admin.email,
      phone: admin.phone ?? null,
      role: admin.role,
    };

    next();
  }
);

/** Allows only the given tenant roles (used for the write/admin-only routes). */
export function requireTenantRole(...roles: TenantRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenantUser) {
      throw new UnauthorizedError("Authentication required");
    }

    if (!roles.includes(req.tenantUser.role)) {
      throw new ForbiddenError(
        `This action requires one of these roles: ${roles.join(", ")}`
      );
    }

    next();
  };
}

/** Narrowing helper for controllers: `tenantAuthenticate` guarantees this. */
export function tenantUser(req: Request): TenantAuthUser {
  if (!req.tenantUser) {
    throw new UnauthorizedError("Authentication required");
  }
  return req.tenantUser;
}
