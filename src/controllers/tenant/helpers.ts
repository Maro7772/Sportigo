import type { Request } from "express";
import { BadRequest } from "../../errors";
import type { TenantModels } from "../../models/tenant";

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Copies an ObjectId query filter (e.g. `?team_id=...`) into `filter`. */
export function filterById(
  filter: Record<string, unknown>,
  req: Request,
  field: string
): void {
  const value = req.query[field];
  if (typeof value !== "string" || !value.trim()) return;

  if (!OBJECT_ID.test(value)) {
    throw new BadRequest(`Invalid ${field}: "${value}"`);
  }

  filter[field] = value;
}

/** Parses `?from=` / `?to=` into a date range filter for `field`. */
export function filterByDateRange(
  filter: Record<string, unknown>,
  req: Request,
  field: string,
  fromKey = "from",
  toKey = "to"
): void {
  const range: Record<string, Date> = {};

  const from = req.query[fromKey];
  if (typeof from === "string" && from.trim()) {
    const date = new Date(from);
    if (Number.isNaN(date.getTime())) throw new BadRequest(`Invalid ${fromKey} date`);
    range.$gte = date;
  }

  const to = req.query[toKey];
  if (typeof to === "string" && to.trim()) {
    const date = new Date(to);
    if (Number.isNaN(date.getTime())) throw new BadRequest(`Invalid ${toKey} date`);
    range.$lte = date;
  }

  if (Object.keys(range).length) filter[field] = range;
}

/** Recomputes `team.players` from the `team-players` collection. */
export async function syncTeamPlayersCount(
  models: TenantModels,
  teamId: unknown
): Promise<number> {
  if (!teamId) return 0;

  const count = await models.TeamPlayer.countDocuments({ team_id: teamId });
  await models.Team.updateOne({ _id: teamId }, { $set: { players: count } });

  return count;
}

/** Recomputes `team.players` for several teams at once. */
export async function syncTeamsPlayersCount(
  models: TenantModels,
  teamIds: unknown[]
): Promise<void> {
  const unique = [...new Set(teamIds.filter(Boolean).map(String))];
  await Promise.all(unique.map((id) => syncTeamPlayersCount(models, id)));
}
