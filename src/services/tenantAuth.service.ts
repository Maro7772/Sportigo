import { randomBytes } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import { getTenantConnection } from "../config/tenant";
import { NotFound } from "../errors";
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
 * Idempotent: returns `{ admin: null }` when the club already has at least one account.
 */
export async function ensureTenantAdmin(
  models: TenantModels,
  subdomain: string,
  options: { name: string; email: string; password: string }
): Promise<{ admin: HydratedDocument<ITenantAdmin> | null }> {
  const existing = await models.Admin.countDocuments();
  if (existing > 0) return { admin: null };

  const admin = await models.Admin.create({
    name: options.name,
    email: options.email,
    password: options.password,
    role: "admin",
    status: true,
  });

  return { admin };
}

export interface TenantInitResult {
  database: string;
  models: TenantModels;
  settings: Awaited<ReturnType<typeof getOrCreateTenantSettings>>;
  admin: HydratedDocument<ITenantAdmin> | null;
}

export async function initTenantDatabase(
  club: { subdomain: string; name: string },
  adminOptions: { name: string; email: string; password: string }
): Promise<TenantInitResult> {
  const connection = getTenantConnection(club.subdomain);
  const models = getTenantModels(connection);

  await ensureTenantIndexes(models);

  const settings = await getOrCreateTenantSettings(models);
  const { admin } = await ensureTenantAdmin(models, club.subdomain, {
    name: adminOptions.name,
    email: adminOptions.email,
    password: adminOptions.password,
  });

  return { database: connection.name, models, settings, admin };
}

/**
 * Reset the admin password of an existing tenant database.
 */
export async function resetTenantAdminPassword(
  models: TenantModels,
  subdomain: string,
  options: {
    admin_id?: string;
    email?: string;
    password?: string;
    activate?: boolean;
  }
): Promise<{
  admin: HydratedDocument<ITenantAdmin> | null;
  password: string | null;
  generated: boolean;
  created: boolean;
}> {
  let admin: HydratedDocument<ITenantAdmin> | null = null;

  if (options.admin_id) {
    admin = await models.Admin.findById(options.admin_id);
    if (!admin) throw new NotFound("Tenant admin not found");
  } else if (options.email) {
    admin = await models.Admin.findOne({ email: options.email });
    if (!admin) throw new NotFound(`No tenant admin with email "${options.email}"`);
  } else {
    admin =
      (await models.Admin.findOne({ email: defaultTenantAdminEmail(subdomain) })) ??
      (await models.Admin.findOne({ role: "admin", status: true }).sort({ createdAt: 1 })) ??
      (await models.Admin.findOne().sort({ createdAt: 1 }));
  }

  const generated = !options.password;
  const newPassword = options.password ?? generatePassword();

  if (!admin) {
    const created = await models.Admin.create({
      name: `${subdomain} Admin`,
      email: defaultTenantAdminEmail(subdomain),
      password: newPassword,
      role: "admin",
      status: true,
    });
    return { admin: created, password: newPassword, generated, created: true };
  }

  admin.password = newPassword;
  if (options.activate === true) admin.status = true;
  await admin.save();

  return { admin, password: newPassword, generated, created: false };
}