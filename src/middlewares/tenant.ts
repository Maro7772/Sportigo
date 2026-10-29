import type { NextFunction, Request, Response } from "express";
import type { Connection, Types } from "mongoose";
import { Club, type IClub } from "../models/Club";
import { Package } from "../models/Package";
import { getOrCreateSettings } from "../models/Settings";
import {
  evaluateSubscription,
  type SubscriptionInfo,
} from "../services/subscription.service";
import {
  cleanSubdomain,
  getTenantConnection,
  tenantDbName,
} from "../config/tenant";
import { getTenantModels as compileTenantModels, type TenantModels } from "../models/tenant";
import { AppError, NotFound } from "../errors";
import { catchAsync } from "../utils/catchAsync";

export interface TenantContext {
  club: IClub & { _id: Types.ObjectId };
  subdomain: string;
  database: string;
  subscription: SubscriptionInfo;
}

/**
 * Extracts the tenant subdomain from the request, in this order:
 * 1. `x-subdomain` header (handy for local development and mobile clients)
 * 2. `?subdomain=` query parameter
 * 3. The host name: the first label before the first dot
 *    (`ahly.example.com` -> `ahly`, `ahly.localhost:4000` -> `ahly`)
 */
export function extractSubdomain(req: Request): string {
  const header = req.headers["x-subdomain"];
  if (typeof header === "string" && header.trim()) {
    return cleanSubdomain(header);
  }

  const query = req.query?.subdomain;
  if (typeof query === "string" && query.trim()) {
    return cleanSubdomain(query);
  }

  const rawHost = String(req.headers.host ?? req.hostname ?? "")
    .split(":")[0]
    .trim()
    .toLowerCase();

  if (!rawHost) return "";

  const parts = rawHost.split(".");
  if (parts.length < 2) return "";

  // admin.example.com / www.example.com -> the second label is the tenant.
  if (parts[0] === "www" && parts.length > 2) return parts[1];

  // localhost / 127.0.0.1 have no tenant.
  if (parts[0] === "localhost" || parts[0] === "127" || /^\d+$/.test(parts[0])) {
    return "";
  }

  return parts[0];
}

/**
 * Resolves the club from the wildcard subdomain and attaches the tenant
 * connection + models to the request.
 *
 * This step does **not** check the subscription, so an expired club can still
 * log in and renew through the cart. Disabled clubs (`status = false`) are
 * rejected here.
 *
 * Use `requireTenantSubscription` for the routes that need an active plan.
 */
export const resolveTenant = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const subdomain = extractSubdomain(req);

    if (!subdomain) {
      throw new NotFound(
        "Subdomain not found. Use the x-subdomain header, ?subdomain= or a subdomain host."
      );
    }

    const club = await Club.findOne({ subdomain }).lean();
    if (!club) throw new NotFound(`No club found for subdomain "${subdomain}"`);

    const settings = await getOrCreateSettings();
    const subscription = evaluateSubscription(club, settings.allowed_days);

    if (!club.status) {
      const packages = await Package.find({ status: true })
        .select("name game_id teams players cycles")
        .sort({ name: 1 })
        .lean();

      throw new AppError("This club is disabled", 403, { subscription, packages });
    }

    const connection: Connection = getTenantConnection(club.subdomain);

    req.tenant = {
      club,
      subdomain: club.subdomain,
      database: tenantDbName(club.subdomain),
      subscription,
    };
    req.tenantDb = connection;
    req.models = compileTenantModels(connection);

    next();
  }
);

/**
 * Blocks the scouting workspace unless the club has an active (or grace)
 * subscription. The 403 response carries the available packages so the club
 * can renew, exactly like the reference project.
 *
 * Auth, `/info`, `/settings`, `/cart` and `/uploads` stay reachable while
 * expired, otherwise the club could never renew.
 */
export const requireTenantSubscription = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const { subscription } = tenantContext(req);

    if (subscription.status === "active" || subscription.status === "grace") {
      return next();
    }

    const packages = await Package.find({ status: true })
      .select("name game_id teams players cycles")
      .sort({ name: 1 })
      .lean();

    throw new AppError(
      "Tenant subscription has expired or is inactive",
      403,
      { subscription, packages }
    );
  }
);

/**
 * Default tenant gate: resolve the club **and** require an active subscription.
 * Kept for routes that should never be reachable on an expired plan.
 */
export const tenantMiddleware = [resolveTenant, requireTenantSubscription];

/** Narrowing helper for controllers: the middleware already guarantees this. */
export function tenantContext(req: Request): TenantContext {
  if (!req.tenant) throw new AppError("Tenant context is missing", 500);
  return req.tenant;
}

/** Narrowing helper for controllers: the middleware already guarantees this. */
export function tenantModels(req: Request): TenantModels {
  if (!req.models) throw new AppError("Tenant models are missing", 500);
  return req.models;
}
