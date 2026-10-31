import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Game } from "../../models/Game";
import { ConflictError, NotFound, BadRequest } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import { Package } from "../../models/Package";
import type { ITeam } from "../../models/tenant";
import { filterById } from "./helpers";

const SORT_FIELDS = ["name", "players", "createdAt", "updatedAt"];

async function assertGameExists(gameId: string): Promise<void> {
  const game = await Game.findById(gameId).select("_id").lean();
  if (!game) throw new NotFound("Game not found");
}

/** `GET /api/tenant/teams` */
export async function listTeams(req: Request, res: Response) {
  const models = tenantModels(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  filterById(filter, req, "game_id");

  const [items, total] = await Promise.all([
    models.Team.find(filter as FilterQuery<ITeam>)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    models.Team.countDocuments(filter as FilterQuery<ITeam>),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/teams/select` */
export async function selectTeams(req: Request, res: Response) {
  const models = tenantModels(req);
  const filter: Record<string, unknown> = {};
  filterById(filter, req, "game_id");

  const items = await models.Team.find(filter)
    .select("name game_id players")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}

/** `GET /api/tenant/teams/:id` */
export async function getTeam(req: Request, res: Response) {
  const models = tenantModels(req);

  const team = await models.Team.findById(req.params.id).lean();
  if (!team) throw new NotFound("Team not found");

  const [players, matches] = await Promise.all([
    models.TeamPlayer.countDocuments({ team_id: team._id }),
    models.Match.countDocuments({
      $or: [
        { team_id: team._id },
        { team1_id: team._id },
        { team2_id: team._id },
      ],
    }),
  ]);

  return SuccessResponse(res, {
    team,
    stats: { players, matches },
  });
}

/** `POST /api/tenant/teams` */
export async function createTeam(req: Request, res: Response) {
  const models = tenantModels(req);
  await assertGameExists(req.body.game_id);

  const { club } = tenantContext(req);
  if (!club.package_id) {
    throw new BadRequest("You must be subscribed to a package to add teams");
  }

  const pkg = await Package.findById(club.package_id).select("teams").lean();
  if (pkg) {
    const currentCount = await models.Team.countDocuments({
      game_id: req.body.game_id,
    });
    if (currentCount >= pkg.teams) {
      throw new BadRequest(
        `You have reached the maximum limit of ${pkg.teams} teams allowed by your package`,
      );
    }
  }

  const team = await models.Team.create({
    name: req.body.name,
    game_id: req.body.game_id,
    players: 0,
  });

  return SuccessResponse(res, { team }, 201, "Team created successfully");
}

/** `PUT|PATCH /api/tenant/teams/:id` */
export async function updateTeam(req: Request, res: Response) {
  const models = tenantModels(req);

  const team = await models.Team.findById(req.params.id);
  if (!team) throw new NotFound("Team not found");

  if (req.body.name !== undefined) team.name = req.body.name;

  if (req.body.game_id !== undefined) {
    await assertGameExists(req.body.game_id);

    if (String(team.game_id) !== String(req.body.game_id)) {
      // Keep the players in sync with the team's new game.
      await models.TeamPlayer.updateMany(
        { team_id: team._id },
        { $set: { game_id: req.body.game_id } },
      );
      team.game_id = req.body.game_id;
    }
  }

  await team.save();

  return SuccessResponse(res, { team }, 200, "Team updated successfully");
}

/** `DELETE /api/tenant/teams/:id` */
export async function deleteTeam(req: Request, res: Response) {
  const models = tenantModels(req);

  const team = await models.Team.findById(req.params.id);
  if (!team) throw new NotFound("Team not found");

  const force =
    req.query.force === "true" ||
    req.query.force === "1" ||
    req.body?.force === true;

  const [players, matches] = await Promise.all([
    models.TeamPlayer.countDocuments({ team_id: team._id }),
    models.Match.countDocuments({
      $or: [
        { team_id: team._id },
        { team1_id: team._id },
        { team2_id: team._id },
      ],
    }),
  ]);

  if (!force && (players > 0 || matches > 0)) {
    throw new ConflictError(
      `Cannot delete this team: it has ${players} player(s) and ${matches} match(es). ` +
        "Pass ?force=true to cascade-delete its players and matches.",
    );
  }

  if (force) {
    const teamPlayers = await models.TeamPlayer.find({ team_id: team._id })
      .select("_id")
      .lean();
    const playerIds = teamPlayers.map((p) => p._id);
    await models.PlayerProgress.deleteMany({ player_id: { $in: playerIds } });
    await models.TeamPlayer.deleteMany({ team_id: team._id });
    await models.Match.deleteMany({
      $or: [
        { team_id: team._id },
        { team1_id: team._id },
        { team2_id: team._id },
      ],
    });
  }

  await team.deleteOne();

  return SuccessResponse(
    res,
    { id: req.params.id },
    200,
    "Team deleted successfully",
  );
}

/** `POST /api/tenant/teams/bulk-delete` */
export async function bulkDeleteTeams(req: Request, res: Response) {
  const models = tenantModels(req);
  const ids: string[] = req.body.ids;

  const [players, matches] = await Promise.all([
    models.TeamPlayer.countDocuments({ team_id: { $in: ids } }),
    models.Match.countDocuments({
      $or: [
        { team_id: { $in: ids } },
        { team1_id: { $in: ids } },
        { team2_id: { $in: ids } },
      ],
    }),
  ]);

  if (players > 0 || matches > 0) {
    throw new ConflictError(
      `Cannot delete: some teams have ${players} player(s) and ${matches} match(es)`,
    );
  }

  const result = await models.Team.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} team(s) deleted successfully`,
  );
}
