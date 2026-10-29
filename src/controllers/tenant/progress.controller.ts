import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Action } from "../../models/Action";
import { BadRequest, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { tenantModels } from "../../middlewares/tenant";
import type { IPlayerProgress, TenantModels } from "../../models/tenant";
import { filterById } from "./helpers";

const SORT_FIELDS = ["createdAt", "updatedAt"];

interface ProgressLinks {
  match_id: unknown;
  action_id: unknown;
  player_id: unknown;
}

/**
 * Enforces the cross-collection rules:
 * - the match and the player belong to this tenant
 * - the action belongs to the central database
 * - the action's game is the player's game
 * - the player's team actually played that match
 */
async function assertProgressLinks(
  models: TenantModels,
  links: ProgressLinks
): Promise<void> {
  const [match, player, action] = await Promise.all([
    models.Match.findById(links.match_id).lean(),
    models.TeamPlayer.findById(links.player_id).lean(),
    Action.findById(links.action_id).lean(),
  ]);

  if (!match) throw new NotFound("Match not found");
  if (!player) throw new NotFound("Player not found");
  if (!action) throw new NotFound("Action not found");

  if (String(action.game_id) !== String(player.game_id)) {
    throw new BadRequest("The action does not belong to the player's game");
  }

  const teamIds = [match.team_id, match.team1_id, match.team2_id]
    .filter(Boolean)
    .map(String);

  if (!teamIds.includes(String(player.team_id))) {
    throw new BadRequest("The player's team did not play this match");
  }
}

/** `GET /api/tenant/player-progress` */
export async function listProgress(req: Request, res: Response) {
  const models = tenantModels(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  filterById(filter, req, "match_id");
  filterById(filter, req, "player_id");
  filterById(filter, req, "action_id");

  const [items, total] = await Promise.all([
    models.PlayerProgress.find(filter as FilterQuery<IPlayerProgress>)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    models.PlayerProgress.countDocuments(filter as FilterQuery<IPlayerProgress>),
  ]);

  // Enrich with the action (central) and player (tenant) names.
  const actionIds = [...new Set(items.map((item) => String(item.action_id)))];
  const playerIds = [...new Set(items.map((item) => String(item.player_id)))];

  const [actions, players] = await Promise.all([
    Action.find({ _id: { $in: actionIds } }).select("name game_id").lean(),
    models.TeamPlayer.find({ _id: { $in: playerIds } })
      .select("name team_id")
      .lean(),
  ]);

  const actionById = new Map(actions.map((action) => [String(action._id), action]));
  const playerById = new Map(players.map((player) => [String(player._id), player]));

  const enriched = items.map((item) => ({
    ...item,
    action: actionById.get(String(item.action_id)) ?? null,
    player: playerById.get(String(item.player_id)) ?? null,
  }));

  return SuccessResponse(res, {
    items: enriched,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/player-progress/:id` */
export async function getProgress(req: Request, res: Response) {
  const models = tenantModels(req);

  const progress = await models.PlayerProgress.findById(req.params.id).lean();
  if (!progress) throw new NotFound("Player progress not found");

  const [match, player, action] = await Promise.all([
    models.Match.findById(progress.match_id).lean(),
    models.TeamPlayer.findById(progress.player_id).lean(),
    Action.findById(progress.action_id).lean(),
  ]);

  return SuccessResponse(res, { progress, match, player, action });
}

/** `POST /api/tenant/player-progress` */
export async function createProgress(req: Request, res: Response) {
  const models = tenantModels(req);

  await assertProgressLinks(models, {
    match_id: req.body.match_id,
    action_id: req.body.action_id,
    player_id: req.body.player_id,
  });

  const progress = await models.PlayerProgress.create({
    match_id: req.body.match_id,
    action_id: req.body.action_id,
    player_id: req.body.player_id,
  });

  return SuccessResponse(res, { progress }, 201, "Player progress created successfully");
}

/** `PUT|PATCH /api/tenant/player-progress/:id` */
export async function updateProgress(req: Request, res: Response) {
  const models = tenantModels(req);

  const progress = await models.PlayerProgress.findById(req.params.id);
  if (!progress) throw new NotFound("Player progress not found");

  const next = {
    match_id: req.body.match_id ?? progress.match_id,
    action_id: req.body.action_id ?? progress.action_id,
    player_id: req.body.player_id ?? progress.player_id,
  };

  await assertProgressLinks(models, next);

  progress.match_id = next.match_id;
  progress.action_id = next.action_id;
  progress.player_id = next.player_id;
  await progress.save();

  return SuccessResponse(res, { progress }, 200, "Player progress updated successfully");
}

/** `DELETE /api/tenant/player-progress/:id` */
export async function deleteProgress(req: Request, res: Response) {
  const models = tenantModels(req);

  const progress = await models.PlayerProgress.findById(req.params.id);
  if (!progress) throw new NotFound("Player progress not found");

  await progress.deleteOne();

  return SuccessResponse(
    res,
    { id: req.params.id },
    200,
    "Player progress deleted successfully"
  );
}

/** `POST /api/tenant/player-progress/bulk-delete` */
export async function bulkDeleteProgress(req: Request, res: Response) {
  const models = tenantModels(req);
  const ids: string[] = req.body.ids;

  const result = await models.PlayerProgress.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} player-progress row(s) deleted successfully`
  );
}
