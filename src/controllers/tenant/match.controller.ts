import type { FilterQuery } from "mongoose";
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

  const teamIds = [match.team_id, match.team1_id, match.team2_id].filter(Boolean);
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
  const { team_id, team1_id, team2_id } = req.body;

  const teamIds = [team_id, team1_id, team2_id].filter(Boolean) as string[];
  const existing = await models.Team.find({ _id: { $in: teamIds } })
    .select("_id")
    .lean();

  if (existing.length !== new Set(teamIds.map(String)).size) {
    throw new NotFound("One of the selected teams does not exist");
  }

  const match = await models.Match.create({
    name: req.body.name,
    date: req.body.date,
    team_id: team1_id || team2_id ? null : team_id,
    team1_id: team1_id ?? null,
    team2_id: team2_id ?? null,
    opponent_name: team1_id || team2_id ? null : (req.body.opponent_name ?? null),
  });

  return SuccessResponse(res, { match }, 201, "Match created successfully");
}

/** `PUT|PATCH /api/tenant/matches/:id` */
export async function updateMatch(req: Request, res: Response) {
  const models = tenantModels(req);

  const match = await models.Match.findById(req.params.id);
  if (!match) throw new NotFound("Match not found");

  const nextTeamId =
    req.body.team_id !== undefined ? req.body.team_id : match.team_id;
  const nextTeam1Id =
    req.body.team1_id !== undefined ? req.body.team1_id : match.team1_id;
  const nextTeam2Id =
    req.body.team2_id !== undefined ? req.body.team2_id : match.team2_id;

  const usesPair = Boolean(nextTeam1Id) || Boolean(nextTeam2Id);
  const usesSingle = Boolean(nextTeamId);

  if (usesPair && usesSingle) {
    throw new BadRequest("Use either team_id or team1_id + team2_id, not both");
  }

  const teamIds = [nextTeamId, nextTeam1Id, nextTeam2Id].filter(Boolean) as string[];
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

  if (usesPair) {
    match.team_id = null;
    match.team1_id = nextTeam1Id;
    match.team2_id = nextTeam2Id;
    match.opponent_name = null;
  } else if (usesSingle) {
    match.team_id = nextTeamId;
    match.team1_id = null;
    match.team2_id = null;
    if (req.body.opponent_name !== undefined) match.opponent_name = req.body.opponent_name;
  }

  await match.save();

  return SuccessResponse(res, { match }, 200, "Match updated successfully");
}

/** `DELETE /api/tenant/matches/:id` */
export async function deleteMatch(req: Request, res: Response) {
  const models = tenantModels(req);

  const match = await models.Match.findById(req.params.id);
  if (!match) throw new NotFound("Match not found");

  const progress = await models.PlayerProgress.countDocuments({ match_id: match._id });
  if (progress > 0) {
    throw new ConflictError(
      `Cannot delete this match: ${progress} player-progress row(s) reference it`
    );
  }

  await match.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Match deleted successfully");
}

/** `POST /api/tenant/matches/bulk-delete` */
export async function bulkDeleteMatches(req: Request, res: Response) {
  const models = tenantModels(req);
  const ids: string[] = req.body.ids;

  const progress = await models.PlayerProgress.countDocuments({ match_id: { $in: ids } });
  if (progress > 0) {
    throw new ConflictError(
      `Cannot delete: ${progress} player-progress row(s) reference some of these matches`
    );
  }

  const result = await models.Match.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} match(es) deleted successfully`
  );
}
