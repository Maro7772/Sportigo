import { env } from "../config/env";
import { SuperAdmin } from "../models/SuperAdmin";
import { getOrCreateSettings } from "../models/Settings";

/**
 * Creates the first super admin from env vars when the collection is empty.
 * Safe to call on every boot: it does nothing if the account already exists.
 */
export async function ensureInitialSuperAdmin(): Promise<void> {
  const email = env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const password = env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      "⚠️  SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are not set - skipping super admin bootstrap"
    );
    return;
  }

  if (password.length < 6) {
    console.warn(
      "⚠️  SUPER_ADMIN_PASSWORD must be at least 6 characters - skipping bootstrap"
    );
    return;
  }

  const existing = await SuperAdmin.findOne({ email });
  if (existing) return;

  await SuperAdmin.create({
    name: env.SUPER_ADMIN_NAME || "Super Admin",
    email,
    password,
    role: "super_admin",
    status: true,
  });

  console.log(`✅ Super admin created: ${email}`);
}

export async function ensureSettings(): Promise<void> {
  await getOrCreateSettings();
}
