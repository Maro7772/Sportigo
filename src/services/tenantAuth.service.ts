import { randomBytes } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import { getTenantConnection } from "../config/tenant";
import {
  ensureTenantIndexes,
  getOrCreateTenantSettings,
  getTenantModels,
  type ITenantAdmin,
  type TenantModels,
} from "../models/tenant";

/** Generates a cryptographically-random 12-character base64url password. */
function generatePassword(): string {
  return randomBytes(9).toString("base64url");
}

/** Email of the first admin created inside a club database. */
export function defaultTenantAdminEmail(subdomain: string): string {
  return `admin@${subdomain}.com`;
}

/**
 * Creates the first admin of a club database when it has none.
 * Idempotent: returns `{ admin: null, password: null }` when the club already
 * has at least one account.
 *
 * Returns the plain-text `password` alongside the document so the caller can
 * include it in the API response before it is hashed and stored.
 */
export async function ensureTenantAdmin(
  models: TenantModels,
  subdomain: string,
  options: { name?: string; email?: string; password?: string } = {}
): Promise<{ admin: HydratedDocument<ITenantAdmin> | null; password: string | null }> {
  const existing = await models.Admin.countDocuments();
  if (existing > 0) return { admin: null, password: null };

  // Resolve the plain-text password BEFORE create() hashes it inside the model
  const plainPassword = options.password ?? generatePassword();

  const admin = await models.Admin.create({
    name: options.name ?? `${subdomain} Admin`,
    email: options.email ?? defaultTenantAdminEmail(subdomain),
    password: plainPassword,
    role: "admin",
    status: true,
  });

  return { admin, password: plainPassword };
}

export interface TenantInitResult {
  database: string;
  models: TenantModels;
  settings: Awaited<ReturnType<typeof getOrCreateTenantSettings>>;
  /** The default admin document when it was just created, otherwise `null`. */
  admin: HydratedDocument<ITenantAdmin> | null;
  /**
   * The plain-text password of the newly created admin.
   * `null` when the admin already existed before this call.
   * Show this once in the API response – it cannot be recovered afterwards.
   */
  admin_password: string | null;
}

/**
 * Prepares a club database: indexes + settings + the first admin.
 * Used when a club is created by the super admin, when `/tenant/init` is
 * called, and by the tenant seeder.
 */
export async function initTenantDatabase(
  club: {
    subdomain: string;
    name: string;
  },
  adminOptions: { name?: string; email?: string; password?: string } = {}
): Promise<TenantInitResult> {
  const connection = getTenantConnection(club.subdomain);
  const models = getTenantModels(connection);

  await ensureTenantIndexes(models);

  const settings = await getOrCreateTenantSettings(models);
  const { admin, password: admin_password } = await ensureTenantAdmin(models, club.subdomain, {
    name: adminOptions.name ?? `${club.name} Admin`,
    email: adminOptions.email,
    password: adminOptions.password,
  });

  return { database: connection.name, models, settings, admin, admin_password };
}
