import type { Request, Response } from "express";
import { BadRequest, UnauthorizedError } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { signTenantToken } from "../../utils/tenantJwt";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import { tenantUser } from "../../middlewares/tenantAuth";
import { env } from "../../config/env";

function clubSummary(ctx: ReturnType<typeof tenantContext>) {
  return {
    id: ctx.club._id,
    name: ctx.club.name,
    subdomain: ctx.subdomain,
    status: ctx.club.status,
    package_id: ctx.club.package_id ?? null,
    start_date: ctx.club.start_date ?? null,
    end_date: ctx.club.end_date ?? null,
  };
}

/**
 * `POST /api/tenant/auth/login`
 *
 * Public (no token), but the club is still resolved from the subdomain, so the
 * credentials are checked **inside that club's own database**.
 * Accepts `email`, `phone`, or `identifier` (either) + `password`.
 */
export async function tenantLogin(req: Request, res: Response) {
  const ctx = tenantContext(req);
  const models = tenantModels(req);

  const { email, phone, identifier, password } = req.body;

  const identifierValue = String(identifier ?? "").trim();
  const conditions: Record<string, unknown>[] = [];

  if (email) conditions.push({ email: String(email).trim().toLowerCase() });
  if (phone) conditions.push({ phone: String(phone).trim() });
  if (identifierValue) {
    conditions.push(
      { email: identifierValue.toLowerCase() },
      { phone: identifierValue }
    );
  }

  if (!conditions.length) throw new BadRequest("email or phone is required");
  if (!password) throw new BadRequest("Password is required");

  const admin = await models.Admin.findOne({ $or: conditions }).select("+password");

  if (!admin) throw new UnauthorizedError("Invalid email/phone or password");

  if (!admin.status) {
    throw new UnauthorizedError(
      "Your account is inactive. Please contact the club administrator."
    );
  }

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) throw new UnauthorizedError("Invalid email/phone or password");

  admin.last_login_at = new Date();
  await admin.save();

  const token = signTenantToken({
    sub: String(admin._id),
    email: admin.email,
    role: admin.role,
    club: ctx.subdomain,
    password_version: admin.password_version ?? 0,
  });

  return SuccessResponse(
    res,
    {
      token,
      token_type: "Bearer",
      expires_in: env.TENANT_JWT_EXPIRES_IN,
      admin: admin.toJSON(),
      club: clubSummary(ctx),
      subscription: ctx.subscription,
    },
    200,
    "Login successful"
  );
}

/** `GET /api/tenant/auth/me` - the signed-in admin + club + subscription. */
export async function getTenantMe(req: Request, res: Response) {
  const ctx = tenantContext(req);
  const user = tenantUser(req);

  return SuccessResponse(res, {
    admin: user,
    club: clubSummary(ctx),
    subscription: ctx.subscription,
  });
}

/** `PUT|PATCH /api/tenant/auth/change-password` */
export async function changeTenantPassword(req: Request, res: Response) {
  const models = tenantModels(req);
  const user = tenantUser(req);

  const admin = await models.Admin.findById(user.id).select("+password");
  if (!admin) throw new UnauthorizedError("Account no longer exists");

  const isMatch = await admin.comparePassword(req.body.current_password);
  if (!isMatch) throw new BadRequest("Current password is incorrect");

  const samePassword = await admin.comparePassword(req.body.new_password);
  if (samePassword) {
    throw new BadRequest("New password must be different from the current password");
  }

  admin.password = req.body.new_password;
  await admin.save();

  return SuccessResponse(res, {}, 200, "Password changed successfully");
}

/** `POST /api/tenant/auth/logout` - stateless JWT: the client drops the token. */
export async function tenantLogout(_req: Request, res: Response) {
  return SuccessResponse(res, {}, 200, "Logged out successfully");
}
