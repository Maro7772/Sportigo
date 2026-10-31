import type { FilterQuery, Types } from "mongoose";
import type { Request, Response } from "express";
import { BadRequest, ConflictError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { tenantModels } from "../../middlewares/tenant";
import type { IMatch } from "../../models/tenant";
import { filterById, filterByDateRange } from "./helpers";

const SORT_FIELDS = ["name", "date", "createdAt", "updatedAt"];

/** `GET /api/tenant/matches` */
export async function listMatches(req: Request, res: Response) {
  const models = tenantModels(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name", "opponent_name"],
    sortFields: SORT_FIELDS,
    defaultSort: "date",
    defaultOrder: -1,
  });

  filterById(filter, req, "team_id");
  filterById(filter, req, "team1_id");
  filterById(filter, req, "team2_id");
  filterByDateRange(filter, req, "date");

  const [items, total] = await Promise.all([
    models.Match.find(filter as FilterQuery<IMatch>)
      .populate("team_id", "name")
      .populate("team1_id", "name")
      .populate("team2_id", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    models.Match.countDocuments(filter as FilterQuery<IMatch>),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/matches/:id` */
export async function getMatch(req: Request, res: Response) {
  const models = tenantModels(req);

  const match = await models.Match.findById(req.params.id).lean();
  if (!match) throw new NotFound("Match not found");

  const teamIds = [match.team_id, match.team1_id, match.team2_id].filter(
    Boolean,
  );
  const [teams, progress] = await Promise.all([
    models.Team.find({ _id: { $in: teamIds } })
      .select("name game_id players")
      .lean(),
    models.PlayerProgress.countDocuments({ match_id: match._id }),
  ]);

  return SuccessResponse(res, {
    match,
    teams,
    stats: { player_progress: progress },
  });
}

/** `POST /api/tenant/matches` */
export async function createMatch(req: Request, res: Response) {
  const models = tenantModels(req);

  const team1Id = req.body.team1_id ?? req.body.team_id;
  const team2Id = req.body.team2_id ?? null;

  const teamIds = [team1Id, team2Id].filter(Boolean) as string[];
  const existing = await models.Team.find({ _id: { $in: teamIds } })
    .select("_id")
    .lean();

  if (existing.length !== new Set(teamIds.map(String)).size) {
    throw new NotFound("One of the selected teams does not exist");
  }

  const match = await models.Match.create({
    name: req.body.name,
    date: req.body.date,
    team_id: team1Id, // legacy alias for team1
    team1_id: team1Id,
    team2_id: team2Id,
    opponent_name: team2Id ? null : (req.body.opponent_name ?? null),
  });

  return SuccessResponse(res, { match }, 201, "Match created successfully");
}

/** `PUT|PATCH /api/tenant/matches/:id` */
export async function updateMatch(req: Request, res: Response) {
  const models = tenantModels(req);

  const match = await models.Match.findById(req.params.id);
  if (!match) throw new NotFound("Match not found");

  const newTeam1 =
    req.body.team1_id !== undefined
      ? req.body.team1_id
      : req.body.team_id !== undefined
        ? req.body.team_id
        : undefined;

  const newTeam2 =
    req.body.team2_id !== undefined ? req.body.team2_id : undefined;

  const teamIds = [newTeam1, newTeam2].filter(
    (v) => v !== undefined && v !== null,
  ) as string[];
  if (teamIds.length) {
    const existing = await models.Team.find({ _id: { $in: teamIds } })
      .select("_id")
      .lean();
    if (existing.length !== new Set(teamIds.map(String)).size) {
      throw new NotFound("One of the selected teams does not exist");
    }
  }

  if (req.body.name !== undefined) match.name = req.body.name;
  if (req.body.date !== undefined) match.date = req.body.date;

  if (newTeam1 !== undefined) {
    match.team_id = newTeam1;
    match.team1_id = newTeam1;
  }
  if (newTeam2 !== undefined) {
    match.team2_id = newTeam2;
  }
  if (req.body.opponent_name !== undefined) {
    match.opponent_name = req.body.opponent_name;
  }

  await match.save();

  return SuccessResponse(res, { match }, 200, "Match updated successfully");
}

/** `DELETE /api/tenant/matches/:id` */
export async function deleteMatch(req: Request, res: Response) {
  const models = tenantModels(req);

  const match = await models.Match.findById(req.params.id);
  if (!match) throw new NotFound("Match not found");

  const progress = await models.PlayerProgress.countDocuments({
    match_id: match._id,
  });
  if (progress > 0) {
    throw new ConflictError(
      `Cannot delete this match: ${progress} player-progress row(s) reference it`,
    );
  }

  await match.deleteOne();

  return SuccessResponse(
    res,
    { id: req.params.id },
    200,
    "Match deleted successfully",
  );
}

/** `POST /api/tenant/matches/bulk-delete` */
export async function bulkDeleteMatches(req: Request, res: Response) {
  const models = tenantModels(req);
  const ids: string[] = req.body.ids;

  const progress = await models.PlayerProgress.countDocuments({
    match_id: { $in: ids },
  });
  if (progress > 0) {
    throw new ConflictError(
      `Cannot delete: ${progress} player-progress row(s) reference some of these matches`,
    );
  }

  const result = await models.Match.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} match(es) deleted successfully`,
  );
}

/* ------------------------------------------------------------------ */
/* Players' actions per match                                          */
/* ------------------------------------------------------------------ */

interface NamedRef {
  _id: Types.ObjectId;
  name: string;
}

interface PlayerActions {
  player: { id: Types.ObjectId; name: string };
  actions: { id: Types.ObjectId; name: string; count: number }[];
}

/**
 * Groups populated player-progress rows into `{ player, actions[{ count }] }`.
 * `populate` replaces the ids with `{ _id, name }` at runtime, but Mongoose
 * still types them as ObjectId, hence the assertion here (done once).
 */
function groupPlayersActions(
  rows: { player_id: unknown; action_id: unknown }[],
): PlayerActions[] {
  const byPlayer = new Map<string, PlayerActions>();

  for (const row of rows) {
    const player = row.player_id as NamedRef | null;
    const action = row.action_id as NamedRef | null;
    if (!player || !action) continue; // the referenced doc was deleted

    const key = String(player._id);
    let entry = byPlayer.get(key);
    if (!entry) {
      entry = { player: { id: player._id, name: player.name }, actions: [] };
      byPlayer.set(key, entry);
    }

    const existing = entry.actions.find(
      (a) => String(a.id) === String(action._id),
    );
    if (existing) existing.count += 1;
    else entry.actions.push({ id: action._id, name: action.name, count: 1 });
  }

  return [...byPlayer.values()];
}

/** `GET /api/tenant/matches/:id/players-actions` */
export async function getMatchPlayersActions(req: Request, res: Response) {
  const models = tenantModels(req);

  const match = await models.Match.findById(req.params.id)
    .select("name")
    .lean();
  if (!match) throw new NotFound("Match not found");

  const rows = await models.PlayerProgress.find({ match_id: match._id })
    .populate("action_id", "name")
    .populate("player_id", "name")
    .lean();

  return SuccessResponse(res, {
    match: { id: match._id, name: match.name },
    players_actions: groupPlayersActions(rows),
  });
}

/** `GET /api/tenant/matches/players-actions` */
export async function getAllMatchesPlayersActions(req: Request, res: Response) {
  const models = tenantModels(req);

  const matches = await models.Match.find().select("name").lean();

  // One query for all matches instead of one query per match.
  const rows = await models.PlayerProgress.find({
    match_id: { $in: matches.map((m) => m._id) },
  })
    .populate("action_id", "name")
    .populate("player_id", "name")
    .lean();

  const rowsByMatch = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = String(row.match_id);
    const list = rowsByMatch.get(key);
    if (list) list.push(row);
    else rowsByMatch.set(key, [row]);
  }

  const items = matches.map((match) => ({
    match: { id: match._id, name: match.name },
    players_actions: groupPlayersActions(
      rowsByMatch.get(String(match._id)) ?? [],
    ),
  }));

  return SuccessResponse(res, { items });
}
