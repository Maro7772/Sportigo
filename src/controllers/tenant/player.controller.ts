import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { BadRequest, ConflictError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { Package } from "../../models/Package";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import type { ITeamPlayer } from "../../models/tenant";
import {
  filterById,
  syncTeamPlayersCount,
  syncTeamsPlayersCount,
} from "./helpers";

const SORT_FIELDS = [
  "name",
  "age",
  "height",
  "weight",
  "createdAt",
  "updatedAt",
];

/** `GET /api/tenant/players` (collection: `team-players`) */
export async function listPlayers(req: Request, res: Response) {
  const models = tenantModels(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  filterById(filter, req, "team_id");
  filterById(filter, req, "game_id");

  const [items, total] = await Promise.all([
    models.TeamPlayer.find(filter as FilterQuery<ITeamPlayer>)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    models.TeamPlayer.countDocuments(filter as FilterQuery<ITeamPlayer>),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/players/:id` */
export async function getPlayer(req: Request, res: Response) {
  const models = tenantModels(req);

  const player = await models.TeamPlayer.findById(req.params.id).lean();
  if (!player) throw new NotFound("Player not found");

  const [team, progress] = await Promise.all([
    models.Team.findById(player.team_id).lean(),
    models.PlayerProgress.countDocuments({ player_id: player._id }),
  ]);

  return SuccessResponse(res, {
    player,
    team,
    stats: { player_progress: progress },
  });
}

/** `POST /api/tenant/players` */
export async function createPlayer(req: Request, res: Response) {
  const models = tenantModels(req);

  const team = await models.Team.findById(req.body.team_id)
    .select("game_id")
    .lean();
  if (!team) throw new NotFound("Team not found");

  const { club } = tenantContext(req);
  if (!club.package_id) {
    throw new BadRequest("You must be subscribed to a package to add players");
  }

  const pkg = await Package.findById(club.package_id).select("players").lean();
  if (pkg) {
    const currentCount = await models.TeamPlayer.countDocuments({
      team_id: team._id,
    });
    if (currentCount >= pkg.players) {
      throw new BadRequest(
        `This team already has ${currentCount} player(s); the club's package allows at most ${pkg.players} player(s) per team.`,
      );
    }
  }

  if (req.body.game_id && String(req.body.game_id) !== String(team.game_id)) {
    throw new BadRequest("game_id must match the game of the selected team");
  }

  const player = await models.TeamPlayer.create({
    team_id: team._id,
    game_id: team.game_id,
    name: req.body.name,
    height: req.body.height,
    weight: req.body.weight,
    age: req.body.age,
  });

  await syncTeamPlayersCount(models, team._id);

  return SuccessResponse(res, { player }, 201, "Player created successfully");
}

/** `PUT|PATCH /api/tenant/players/:id` */
export async function updatePlayer(req: Request, res: Response) {
  const models = tenantModels(req);

  const player = await models.TeamPlayer.findById(req.params.id);
  if (!player) throw new NotFound("Player not found");

  const previousTeamId = player.team_id;

  if (req.body.team_id !== undefined) {
    const team = await models.Team.findById(req.body.team_id)
      .select("game_id")
      .lean();
    if (!team) throw new NotFound("Team not found");

    // Enforce the club package's per-team player limit when moving into a new team.
    if (String(req.body.team_id) !== String(player.team_id)) {
      const { club } = tenantContext(req);
      if (club.package_id) {
        const pkg = await Package.findById(club.package_id)
          .select("players")
          .lean();
        if (pkg) {
          const currentCount = await models.TeamPlayer.countDocuments({
            team_id: team._id,
            _id: { $ne: player._id },
          });
          if (currentCount >= pkg.players) {
            throw new BadRequest(
              `Destination team already has ${currentCount} player(s); the club's package allows at most ${pkg.players} player(s) per team.`,
            );
          }
        }
      }
    }

    player.team_id = team._id;
    player.game_id = team.game_id;
  }

  if (req.body.game_id !== undefined) {
    if (String(req.body.game_id) !== String(player.game_id)) {
      throw new BadRequest("game_id must match the game of the player's team");
    }
  }

  if (req.body.name !== undefined) player.name = req.body.name;
  if (req.body.height !== undefined) player.height = req.body.height;
  if (req.body.weight !== undefined) player.weight = req.body.weight;
  if (req.body.age !== undefined) player.age = req.body.age;

  await player.save();

  await syncTeamsPlayersCount(models, [previousTeamId, player.team_id]);

  return SuccessResponse(res, { player }, 200, "Player updated successfully");
}

/** `DELETE /api/tenant/players/:id` */
export async function deletePlayer(req: Request, res: Response) {
  const models = tenantModels(req);

  const player = await models.TeamPlayer.findById(req.params.id);
  if (!player) throw new NotFound("Player not found");

  const progress = await models.PlayerProgress.countDocuments({
    player_id: player._id,
  });
  if (progress > 0) {
    throw new ConflictError(
      `Cannot delete this player: ${progress} player-progress row(s) reference it`,
    );
  }

  await player.deleteOne();
  await syncTeamPlayersCount(models, player.team_id);

  return SuccessResponse(
    res,
    { id: req.params.id },
    200,
    "Player deleted successfully",
  );
}

/** `POST /api/tenant/players/bulk-delete` */
export async function bulkDeletePlayers(req: Request, res: Response) {
  const models = tenantModels(req);
  const ids: string[] = req.body.ids;

  const progress = await models.PlayerProgress.countDocuments({
    player_id: { $in: ids },
  });
  if (progress > 0) {
    throw new ConflictError(
      `Cannot delete: ${progress} player-progress row(s) reference some of these players`,
    );
  }

  const players = await models.TeamPlayer.find({ _id: { $in: ids } })
    .select("team_id")
    .lean();

  const result = await models.TeamPlayer.deleteMany({ _id: { $in: ids } });

  await syncTeamsPlayersCount(
    models,
    players.map((player) => player.team_id),
  );

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} player(s) deleted successfully`,
  );
}
