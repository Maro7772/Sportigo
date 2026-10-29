import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "../errors";
import type { TenantRole } from "../models/tenant/TenantAdmin";

/**
 * Tenant tokens are signed with the same secret as super admin tokens, but
 * carry `type: "tenant"` + the club subdomain. That means:
 * - a super admin token can never be used on `/api/tenant/*`
 * - a token issued for `ahly` can never be used on `zamalek`
 */
export interface TenantTokenPayload {
  sub: string;
  email: string;
  role: TenantRole;
  /** Club subdomain the token was issued for (= tenant database name). */
  club: string;
  type: "tenant";
  /** Password version the token was issued with (revokes older sessions). */
  password_version: number;
}

export function signTenantToken(
  payload: Omit<TenantTokenPayload, "type">
): string {
  return jwt.sign({ ...payload, type: "tenant" }, env.JWT_SECRET, {
    expiresIn: env.TENANT_JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyTenantToken(token: string): TenantTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === "string" || !decoded.sub) {
      throw new Error("Malformed token payload");
    }

    if ((decoded as jwt.JwtPayload).type !== "tenant") {
      throw new Error("Not a tenant token");
    }

    const role = String((decoded as jwt.JwtPayload).role ?? "") as TenantRole;
    if (role !== "admin" && role !== "coach" && role !== "viewer") {
      throw new Error("Unknown tenant role");
    }

    return {
      sub: String(decoded.sub),
      email: String((decoded as jwt.JwtPayload).email ?? ""),
      role,
      club: String((decoded as jwt.JwtPayload).club ?? ""),
      type: "tenant",
      password_version: Number((decoded as jwt.JwtPayload).password_version ?? 0),
    };
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
