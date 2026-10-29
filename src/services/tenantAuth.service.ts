import type { HydratedDocument } from "mongoose";
import { env } from "../config/env";
import { getTenantConnection } from "../config/tenant";
import {
  ensureTenantIndexes,
  getOrCreateTenantSettings,
  getTenantModels,
  type ITenantAdmin,
  type TenantModels,
} from "../models/tenant";

/** Email of the first admin created inside a club database. */
export function defaultTenantAdminEmail(subdomain: string): string {
  return `admin@${subdomain}.com`;
}

/**
 * Creates the first admin of a club database when it has none.
 * Idempotent: returns `null` when the club already has at least one account.
 *
 * Credentials: `admin@<subdomain>.com` + `TENANT_DEFAULT_PASSWORD`.
 * They are meant to be changed right after the first login.
 */
export async function ensureTenantAdmin(
  models: TenantModels,
  subdomain: string,
  options: { name?: string; email?: string; password?: string } = {}
): Promise<HydratedDocument<ITenantAdmin> | null> {
  const existing = await models.Admin.countDocuments();
  if (existing > 0) return null;

  return models.Admin.create({
    name: options.name ?? `${subdomain} Admin`,
    email: options.email ?? defaultTenantAdminEmail(subdomain),
    password: options.password ?? env.TENANT_DEFAULT_PASSWORD,
    role: "admin",
    status: true,
  });
}

export interface TenantInitResult {
  database: string;
  models: TenantModels;
  settings: Awaited<ReturnType<typeof getOrCreateTenantSettings>>;
  /** The default admin when it was just created, otherwise `null`. */
  admin: HydratedDocument<ITenantAdmin> | null;
}

/**
 * Prepares a club database: indexes + settings + the first admin.
 * Used when a club is created by the super admin, when `/tenant/init` is
 * called, and by the tenant seeder.
 */
export async function initTenantDatabase(club: {
  subdomain: string;
  name: string;
}): Promise<TenantInitResult> {
  const connection = getTenantConnection(club.subdomain);
  const models = getTenantModels(connection);

  await ensureTenantIndexes(models);

  const settings = await getOrCreateTenantSettings(models);
  const admin = await ensureTenantAdmin(models, club.subdomain, {
    name: `${club.name} Admin`,
  });

  return { database: connection.name, models, settings, admin };
}
