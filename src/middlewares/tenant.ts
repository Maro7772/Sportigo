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
import { env } from "../config/env";
import { getTenantModels as compileTenantModels, type TenantModels } from "../models/tenant";
import { AppError, NotFound } from "../errors";
import { catchAsync } from "../utils/catchAsync";

export interface TenantContext {
  club: IClub & { _id: Types.ObjectId };
  subdomain: string;
  database: string;
  subscription: SubscriptionInfo;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Lowercases a host value and strips the port, a trailing dot and proxies lists. */
export function normalizeHost(value: string): string {
  return String(value ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** The host the client actually used, preferring the reverse-proxy header. */
export function requestHost(req: Request): string {
  const forwarded = req.headers["x-forwarded-host"];
  const raw =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded) ??
    req.headers.host ??
    req.hostname ??
    "";

  return normalizeHost(String(raw));
}

/** `admin`, `api` and `www` belong to the super admin app, never to a club. */
export function isSuperAdminLabel(label: string): boolean {
  return env.SUPER_ADMIN_SUBDOMAINS.includes(label);
}

/**
 * Extracts the tenant label from a host name.
 * Returns `""` when the host belongs to the super admin (or is not a domain).
 *
 * | Host                       | Result |
 * |----------------------------|--------|
 * | `sportego.org`             | `""`   (apex = super admin) |
 * | `www.sportego.org`         | `""`   (reserved label) |
 * | `admin.sportego.org`       | `""`   (reserved label) |
 * | `ahly.sportego.org`        | `ahly` |
 * | `ahly.club.example.com`    | `ahly` (first label before the dot) |
 * | `ahly.localhost`           | `ahly` (local development) |
 * | `localhost`, `127.0.0.1`   | `""`   |
 */
export function tenantFromHost(host: string): string {
  const hostname = normalizeHost(host);

  if (!hostname) return "";
  // Bare localhost, raw IPv4/IPv6 addresses: no tenant.
  if (hostname === "localhost" || IPV4.test(hostname) || hostname.includes(":")) {
    return "";
  }

  const parts = hostname.split(".");
  if (parts.length < 2) return "";

  // <club>.localhost -> club (local development).
  if (parts[1] === "localhost") {
    return isSuperAdminLabel(parts[0]) ? "" : parts[0];
  }

  // <club>.sportego.org -> club. The apex itself stays with the super admin.
  const appDomain = env.APP_DOMAIN;
  if (appDomain && hostname !== appDomain && hostname.endsWith(`.${appDomain}`)) {
    const label = hostname.slice(0, -(appDomain.length + 1)).split(".")[0];
    return label && !isSuperAdminLabel(label) ? label : "";
  }

  // Unknown domain: a 2-label host is an apex, never a tenant.
  if (parts.length < 3) return "";

  // The first label before the dot is the club, e.g. `ahly.club.example.com`.
  return isSuperAdminLabel(parts[0]) ? "" : parts[0];
}

/**
 * Extracts the tenant subdomain from the request, in this order:
 * 1. `x-subdomain` header (handy for local development and mobile clients)
 * 2. `?subdomain=` query parameter
 * 3. The host name: the first label before the first dot
 *    (`ahly.sportego.org` -> `ahly`, `ahly.localhost:4000` -> `ahly`).
 *
 * The apex (`sportego.org`), `www` and the super-admin hosts (`admin`, `api`)
 * return `""`, so the super admin API is reachable from all of them.
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

  return tenantFromHost(requestHost(req));
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
