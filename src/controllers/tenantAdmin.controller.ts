import type { Request, Response } from "express";
import { Club } from "../models/Club";
import { BadRequest, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { getTenantConnection, tenantStats } from "../config/tenant";
import { getTenantModels } from "../models/tenant";
import {
  initTenantDatabase,
  resetTenantAdminPassword,
  defaultTenantAdminEmail,
} from "../services/tenantAuth.service";

async function findClub(id: string) {
  const club = await Club.findById(id);
  if (!club) throw new NotFound("Club not found");
  return club;
}

export async function getClubTenant(req: Request, res: Response) {
  const club = await findClub(String(req.params.id));
  const stats = await tenantStats(club.subdomain);

  return SuccessResponse(res, {
    club: { id: club._id, name: club.name, subdomain: club.subdomain },
    ...stats,
  });
}

export async function initClubTenant(req: Request, res: Response) {
  const club = await findClub(String(req.params.id));

  const { admin_name, admin_email, admin_password } = req.body as {
    admin_name?: string;
    admin_email?: string;
    admin_password?: string;
  };

  if (!admin_name || !admin_email || !admin_password) {
    throw new BadRequest(
      "admin_name, admin_email and admin_password are required to initialize a tenant"
    );
  }

  const { settings, admin } = await initTenantDatabase(
    { subdomain: club.subdomain, name: club.name },
    { name: admin_name, email: admin_email, password: admin_password }
  );

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
          }
        : { email: admin_email, created: false },
      ...stats,
    },
    200,
    "Tenant database initialized successfully"
  );
}

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

  const result = await resetTenantAdminPassword(models, club.subdomain, {
    admin_id,
    email,
    password,
    activate,
  });

  const clubSummary = {
    id: club._id,
    name: club.name,
    subdomain: club.subdomain,
    database: connection.name,
  };

  return SuccessResponse(
    res,
    {
      club: clubSummary,
      admin: result.admin
        ? {
            id: result.admin._id,
            name: result.admin.name,
            email: result.admin.email,
            role: result.admin.role,
            status: result.admin.status,
          }
        : { email: defaultTenantAdminEmail(club.subdomain), created: false },
      password: result.password,
      generated: result.generated,
      created: result.created,
    },
    result.created ? 201 : 200,
    result.created
      ? "Tenant admin created with a new password"
      : "Tenant admin password reset successfully"
  );
}