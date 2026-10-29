import type { Request, Response } from "express";
import { getOrCreateTenantSettings } from "../../models/tenant";
import { SuccessResponse } from "../../utils/response";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import { tenantUser } from "../../middlewares/tenantAuth";

/** `GET /api/tenant/info` - everything the tenant dashboard needs on load. */
export async function getTenantInfo(req: Request, res: Response) {
  const { club, subdomain, database, subscription } = tenantContext(req);
  const models = tenantModels(req);
  const admin = tenantUser(req);

  const [settings, teams, players, matches, progress, carts, admins] = await Promise.all([
    getOrCreateTenantSettings(models),
    models.Team.countDocuments(),
    models.TeamPlayer.countDocuments(),
    models.Match.countDocuments(),
    models.PlayerProgress.countDocuments(),
    models.Cart.countDocuments(),
    models.Admin.countDocuments(),
  ]);

  return SuccessResponse(res, {
    admin,
    club: {
      id: club._id,
      name: club.name,
      subdomain,
      status: club.status,
      package_id: club.package_id ?? null,
      start_date: club.start_date ?? null,
      end_date: club.end_date ?? null,
    },
    subscription,
    database,
    settings,
    counts: {
      teams,
      players,
      matches,
      player_progress: progress,
      cart: carts,
      admins,
    },
  });
}
