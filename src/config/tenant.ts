import mongoose, { type Connection } from "mongoose";
import { env } from "./env";
import { BadRequest } from "../errors";
import { SUBDOMAIN_PATTERN } from "../utils/helpers";

/**
 * Wildcard multi-tenancy (MongoDB edition).
 *
 * Every club owns a separate database. The database name is the first label of
 * the host (`ahly.example.com` -> `ahly`), exactly like the MySQL reference
 * project, where the subdomain is also the schema name.
 *
 * `useDb()` reuses the same MongoClient/pool as the central connection, so a
 * tenant database does not cost an extra connection pool.
 */

/** Database names MongoDB reserves for itself (cannot be used by a tenant). */
const RESERVED_DB_NAMES = new Set(["admin", "local", "config"]);

/** Normalizes a raw subdomain (`Ahly ` -> `ahly`) without rewriting it. */
export function cleanSubdomain(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidSubdomain(value: string): boolean {
  return SUBDOMAIN_PATTERN.test(value);
}

/** True when the subdomain would collide with a MongoDB internal database. */
export function isReservedSubdomain(value: string): boolean {
  const name = `${env.TENANT_DB_PREFIX}${cleanSubdomain(value)}`.toLowerCase();

  return (
    RESERVED_DB_NAMES.has(name) ||
    name === env.MONGODB_DB_NAME.toLowerCase() ||
    name === "test"
  );
}

/**
 * Resolves the tenant database name for a subdomain.
 * With the default empty `TENANT_DB_PREFIX` the name is the subdomain itself.
 */
export function tenantDbName(subdomain: string): string {
  const clean = cleanSubdomain(subdomain);

  if (!clean) throw new BadRequest("Subdomain is required");

  if (!isValidSubdomain(clean)) {
    throw new BadRequest(`Invalid subdomain: "${subdomain}"`);
  }

  if (isReservedSubdomain(clean)) {
    throw new BadRequest(`"${clean}" is a reserved database name`);
  }

  return `${env.TENANT_DB_PREFIX}${clean}`;
}

const tenantConnections = new Map<string, Connection>();

/**
 * Returns the (cached) connection of a tenant database.
 * Models are compiled per connection, see `getTenantModels`.
 */
export function getTenantConnection(subdomain: string): Connection {
  const dbName = tenantDbName(subdomain);

  const cached = tenantConnections.get(dbName);
  if (cached) return cached;

  const connection = mongoose.connection.useDb(dbName, { useCache: true });
  tenantConnections.set(dbName, connection);

  return connection;
}

/** Forgets a cached tenant connection (used when a club is deleted/renamed). */
export function forgetTenantConnection(subdomain: string): void {
  const clean = cleanSubdomain(subdomain);
  tenantConnections.delete(`${env.TENANT_DB_PREFIX}${clean}`);
}

/** Drops a tenant database and its cached connection. */
export async function dropTenantDatabase(subdomain: string): Promise<void> {
  const dbName = tenantDbName(subdomain);
  const connection = getTenantConnection(subdomain);

  await connection.dropDatabase();
  await connection.close();
  tenantConnections.delete(dbName);
}

/** Collection counts of a tenant database (used by the super admin). */
export async function tenantStats(subdomain: string): Promise<{
  database: string;
  collections: Record<string, number>;
  documents: number;
}> {
  const connection = getTenantConnection(subdomain);
  const db = connection.db;

  if (!db) {
    return { database: tenantDbName(subdomain), collections: {}, documents: 0 };
  }

  const collections = await db.listCollections().toArray();
  const counts: Record<string, number> = {};

  await Promise.all(
    collections.map(async (collection) => {
      counts[collection.name] = await db.collection(collection.name).countDocuments();
    })
  );

  const documents = Object.values(counts).reduce((total, value) => total + value, 0);

  return { database: db.databaseName, collections: counts, documents };
}
