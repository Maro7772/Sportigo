import dotenv from "dotenv";

dotenv.config();

function str(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function num(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** Extracts the database name from a MongoDB URI (`.../ahly?authSource=...`). */
function dbNameFromUri(uri: string): string {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//i, "");
  const slashIndex = withoutProtocol.indexOf("/");
  if (slashIndex === -1) return "";

  return withoutProtocol
    .slice(slashIndex + 1)
    .split("?")[0]
    .trim();
}

const nodeEnv = str("NODE_ENV", "development");
const jwtSecret = str(
  "JWT_SECRET",
  "dev-only-insecure-secret-change-me-please",
);
const mongoUri = str(
  "MONGODB_URI",
  "mongodb://127.0.0.1:27017/scouting_super_admin",
);

/**
 * The central database. When the URI already contains one (`.../sportig`) it
 * wins, otherwise `MONGODB_DB_NAME` is used. This value is also used to reject
 * a club subdomain that would collide with the central database.
 */
const mongoDbName =
  dbNameFromUri(mongoUri) || str("MONGODB_DB_NAME", "scouting_super_admin");

if (nodeEnv === "production" && jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters in production");
}

export const env = {
  NODE_ENV: nodeEnv,
  isProduction: nodeEnv === "production",
  PORT: num("PORT", 4000),

  MONGODB_URI: mongoUri,
  /** Used only when MONGODB_URI does not already contain a database name. */
  MONGODB_DB_NAME: mongoDbName,

  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: str("JWT_EXPIRES_IN", "7d"),
  /** Lifetime of a tenant (club) admin token. */
  TENANT_JWT_EXPIRES_IN: str("TENANT_JWT_EXPIRES_IN", "7d"),

  SUPER_ADMIN_NAME: str("SUPER_ADMIN_NAME", "Super Admin"),
  SUPER_ADMIN_EMAIL: str("SUPER_ADMIN_EMAIL", ""),
  SUPER_ADMIN_PASSWORD: str("SUPER_ADMIN_PASSWORD", ""),

  CORS_ORIGINS: str("CORS_ORIGINS", "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Local directory for uploaded images (payment proofs, logos...). */
  UPLOAD_DIR: str("UPLOAD_DIR", "uploads"),
  /** Maximum accepted image size in megabytes. */
  UPLOAD_MAX_MB: num("UPLOAD_MAX_MB", 5),
  /**
   * Public origin used to build absolute upload URLs
   * (e.g. https://sportego.org). When empty, the current request host is used.
   */
  PUBLIC_BASE_URL: str("PUBLIC_BASE_URL", "").replace(/\/$/, ""),

  /**
   * Prefix added to the tenant database name when TENANT_SAME_DATABASE=false.
   * Empty by default: the subdomain itself is the database name
   * (e.g. `ahly.example.com` -> database `ahly`).
   */
  TENANT_DB_PREFIX: str("TENANT_DB_PREFIX", ""),

  /**
   * Apex domain of the platform. A host that ends with `.<APP_DOMAIN>` is a
   * tenant (`ahly.sportego.org` -> club `ahly`), while the apex itself
   * (`sportego.org`) belongs to the super admin.
   */
  APP_DOMAIN: str("APP_DOMAIN", "sportego.org").trim().toLowerCase(),

  /**
   * Host labels reserved for the super admin app. They are never treated as
   * tenants, so `admin.sportego.org` and `www.sportego.org` both serve the
   * super admin API.
   */
  SUPER_ADMIN_SUBDOMAINS: str("SUPER_ADMIN_SUBDOMAINS", "admin,api,www")
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean),
};
