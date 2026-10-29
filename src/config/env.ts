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

/** Extracts the database name from a MongoDB URI (`.../ahly?authSource=...`). */
function dbNameFromUri(uri: string): string {
  const withoutProtocol = uri.replace(/^mongodb(\+srv)?:\/\//i, "");
  const slashIndex = withoutProtocol.indexOf("/");
  if (slashIndex === -1) return "";

  return withoutProtocol.slice(slashIndex + 1).split("?")[0].trim();
}

const nodeEnv = str("NODE_ENV", "development");
const jwtSecret = str("JWT_SECRET", "dev-only-insecure-secret-change-me-please");
const mongoUri = str("MONGODB_URI", "mongodb://127.0.0.1:27017/scouting_super_admin");

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
   * Prefix added to the tenant database name.
   * Empty by default: the subdomain itself is the database name
   * (e.g. `ahly.example.com` -> database `ahly`).
   */
  TENANT_DB_PREFIX: str("TENANT_DB_PREFIX", ""),

  /**
   * Password of the first admin created in a new tenant database.
   * The email is always `admin@<subdomain>.com`; both should be changed
   * after the first login.
   */
  TENANT_DEFAULT_PASSWORD: str("TENANT_DEFAULT_PASSWORD", "123456"),
};
