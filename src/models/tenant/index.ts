import type { Connection, HydratedDocument, Model } from "mongoose";
import { teamModel, type ITeam } from "./Team";
import { teamPlayerModel, type ITeamPlayer } from "./TeamPlayer";
import { matchModel, type IMatch } from "./Match";
import { playerProgressModel, type IPlayerProgress } from "./PlayerProgress";
import { cartModel, type ICart } from "./Cart";
import { tenantSettingsModel, type ITenantSettings } from "./TenantSettings";
import {
  tenantAdminModel,
  type ITenantAdmin,
  type TenantAdminModel,
} from "./TenantAdmin";

export interface TenantModels {
  Team: Model<ITeam>;
  TeamPlayer: Model<ITeamPlayer>;
  Match: Model<IMatch>;
  PlayerProgress: Model<IPlayerProgress>;
  Cart: Model<ICart>;
  TenantSettings: Model<ITenantSettings>;
  /** Club staff accounts (collection `admin`). */
  Admin: TenantAdminModel;
}

/**
 * Compiles (and caches) the tenant models on a tenant connection.
 * `connection.models` is the cache, so calling this on every request is cheap.
 */
export function getTenantModels(connection: Connection): TenantModels {
  return {
    Team: teamModel(connection),
    TeamPlayer: teamPlayerModel(connection),
    Match: matchModel(connection),
    PlayerProgress: playerProgressModel(connection),
    Cart: cartModel(connection),
    TenantSettings: tenantSettingsModel(connection),
    Admin: tenantAdminModel(connection),
  };
}

/** Creates the tenant indexes (safe to call many times). */
export async function ensureTenantIndexes(models: TenantModels): Promise<void> {
  await Promise.all([
    models.Team.createIndexes(),
    models.TeamPlayer.createIndexes(),
    models.Match.createIndexes(),
    models.PlayerProgress.createIndexes(),
    models.Cart.createIndexes(),
    models.TenantSettings.createIndexes(),
    models.Admin.createIndexes(),
  ]);
}

/** Returns the single settings document of a tenant, creating it on first use. */
export async function getOrCreateTenantSettings(
  models: TenantModels
): Promise<HydratedDocument<ITenantSettings>> {
  const existing = await models.TenantSettings.findOne({ key: "tenant" });
  if (existing) return existing;

  try {
    return await models.TenantSettings.create({
      key: "tenant",
      logo: null,
      background_color: ["#0f172a", "#1e293b"],
      color: ["#16a34a"],
    });
  } catch {
    // Race between two first requests: the unique index rejected one of them.
    const created = await models.TenantSettings.findOne({ key: "tenant" });
    if (created) return created;
    throw new Error("Could not create the tenant settings document");
  }
}

export {
  teamModel,
  teamPlayerModel,
  matchModel,
  playerProgressModel,
  cartModel,
  tenantSettingsModel,
  tenantAdminModel,
};

export type {
  ITeam,
  ITeamPlayer,
  IMatch,
  IPlayerProgress,
  ICart,
  ITenantSettings,
  ITenantAdmin,
};
export type { CartStatus } from "./Cart";
export type { TenantRole } from "./TenantAdmin";
