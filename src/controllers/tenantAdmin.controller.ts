import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import type { HydratedDocument } from "mongoose";
import { Club } from "../models/Club";
import { NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { getTenantConnection, tenantStats } from "../config/tenant";
import { getTenantModels, type ITenantAdmin } from "../models/tenant";
import { initTenantDatabase, defaultTenantAdminEmail } from "../services/tenantAuth.service";

/** Readable random password (12 chars) used when the caller does not send one. */
function generateTenantPassword(): string {
  return randomBytes(9).toString("base64url");
}

async function findClub(id: string) {
  const club = await Club.findById(id);
  if (!club) throw new NotFound("Club not found");
  return club;
}

/**
 * `GET /api/clubs/:id/tenant`
 * Shows the tenant database of a club and how many documents each collection has.
 */
export async function getClubTenant(req: Request, res: Response) {
  const club = await findClub(String(req.params.id));

  const stats = await tenantStats(club.subdomain);

  return SuccessResponse(res, {
    club: { id: club._id, name: club.name, subdomain: club.subdomain },
    ...stats,
  });
}

/**
 * `POST /api/clubs/:id/tenant/init`
 * Creates the indexes, the default settings document and the first club admin.
 */
export async function initClubTenant(req: Request, res: Response) {
  const club = await findClub(String(req.params.id));

  const { settings, admin, admin_password } = await initTenantDatabase({
    subdomain: club.subdomain,
    name: club.name,
  });

  const stats = await tenantStats(club.subdomain);

  return SuccessResponse(
    res,
    {
      club: { id: club._id, name: club.name, subdomain: club.subdomain },
      settings,
      admin: admin
        ? {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            created: true,
            password: admin_password,
          }
        : {
            email: defaultTenantAdminEmail(club.subdomain),
            created: false,
            password: null,
          },
      ...stats,
    },
    200,
    "Tenant database initialized successfully"
  );
}

/**
 * `POST /api/clubs/:id/tenant/reset-admin`
 *
 * Super admin recovery for a club that lost its password:
 * - targets `admin_id`, `email`, or by default `admin@<subdomain>.com`
 * - if the club has no account at all, the default admin is created
 * - without `password` a random one is generated and returned **once**
 * - `activate: true` re-enables a locked account in the same call
 *
 * The reset also revokes every token issued before it (password_changed_at).
 */
export async function resetClubTenantAdmin(req: Request, res: Response) {
  const club = await findClub(String(req.params.id));

  const connection = getTenantConnection(club.subdomain);
  const models = getTenantModels(connection);

  const { admin_id, email, password, activate } = req.body as {
    admin_id?: string;
    email?: string;
    password?: string;
    activate?: boolean;
  };

  let admin: HydratedDocument<ITenantAdmin> | null = null;

  if (admin_id) {
    admin = await models.Admin.findById(admin_id);
    if (!admin) throw new NotFound("Tenant admin not found");
  } else if (email) {
    admin = await models.Admin.findOne({ email });
    if (!admin) throw new NotFound(`No tenant admin with email "${email}"`);
  } else {
    // Default target: the provisioned admin, then the oldest active admin.
    admin =
      (await models.Admin.findOne({ email: defaultTenantAdminEmail(club.subdomain) })) ??
      (await models.Admin.findOne({ role: "admin", status: true }).sort({ createdAt: 1 })) ??
      (await models.Admin.findOne().sort({ createdAt: 1 }));
  }

  const generated = !password;
  const newPassword = password ?? generateTenantPassword();

  const clubSummary = {
    id: club._id,
    name: club.name,
    subdomain: club.subdomain,
    database: connection.name,
  };

  if (!admin) {
    const created = await models.Admin.create({
      name: `${club.name} Admin`,
      email: defaultTenantAdminEmail(club.subdomain),
      password: newPassword,
      role: "admin",
      status: true,
    });

    return SuccessResponse(
      res,
      {
        club: clubSummary,
        admin: {
          id: created._id,
          name: created.name,
          email: created.email,
          role: created.role,
          status: created.status,
        },
        password: newPassword,
        generated,
        created: true,
      },
      201,
      "Tenant admin created with a new password"
    );
  }

  admin.password = newPassword;
  if (activate === true) admin.status = true;
  await admin.save();

  return SuccessResponse(
    res,
    {
      club: clubSummary,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
      },
      password: newPassword,
      generated,
      created: false,
    },
    200,
    "Tenant admin password reset successfully"
  );
}
