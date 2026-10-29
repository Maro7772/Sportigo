import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "../errors";

export type SuperAdminRole = "super_admin";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: SuperAdminRole;
  /** Distinguishes super admin tokens from tenant (club) tokens. */
  type: "super_admin";
}

export function signAccessToken(payload: Omit<AuthTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "super_admin" }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded === "string" || !decoded.sub) {
      throw new Error("Malformed token payload");
    }

    const payload = decoded as jwt.JwtPayload;

    // Tenant tokens always carry a club; they must never authenticate here.
    if (payload.type === "tenant" || Boolean(payload.club)) {
      throw new Error("Not a super admin token");
    }

    if (payload.type !== undefined && payload.type !== "super_admin") {
      throw new Error("Not a super admin token");
    }

    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      role: "super_admin",
      type: "super_admin",
    };
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
