import type { Request, Response } from "express";
import { SuperAdmin } from "../models/SuperAdmin";
import { BadRequest, UnauthorizedError } from "../errors";
import { SuccessResponse } from "../utils/response";
import { signAccessToken } from "../utils/jwt";

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const admin = await SuperAdmin.findOne({ email }).select("+password");
  if (!admin) throw new UnauthorizedError("Invalid email or password");
  if (!admin.status) throw new UnauthorizedError("Account is inactive");

  const isMatch = await admin.comparePassword(password);
  if (!isMatch) throw new UnauthorizedError("Invalid email or password");

  admin.last_login_at = new Date();
  await admin.save();

  const token = signAccessToken({
    sub: String(admin._id),
    email: admin.email,
    role: "super_admin",
  });

  return SuccessResponse(
    res,
    { token, admin: admin.toJSON() },
    200,
    "Login successful"
  );
}

export async function getMe(req: Request, res: Response) {
  const admin = await SuperAdmin.findById(req.user?.sub).lean();
  if (!admin) throw new UnauthorizedError("Account no longer exists");

  return SuccessResponse(res, { admin });
}

export async function changePassword(req: Request, res: Response) {
  const { current_password, new_password } = req.body;

  const admin = await SuperAdmin.findById(req.user?.sub).select("+password");
  if (!admin) throw new UnauthorizedError("Account no longer exists");

  const isMatch = await admin.comparePassword(current_password);
  if (!isMatch) throw new BadRequest("Current password is incorrect");

  const samePassword = await admin.comparePassword(new_password);
  if (samePassword) {
    throw new BadRequest("New password must be different from the current password");
  }

  admin.password = new_password;
  await admin.save();

  return SuccessResponse(res, {}, 200, "Password changed successfully");
}

export async function logout(_req: Request, res: Response) {
  // Stateless JWT: the client discards the token.
  return SuccessResponse(res, {}, 200, "Logged out successfully");
}
