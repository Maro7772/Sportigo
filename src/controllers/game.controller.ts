import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Game, type IGame } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { Club } from "../models/Club";
import { Order } from "../models/Order";
import { ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";

const SORT_FIELDS = ["name", "status", "createdAt", "updatedAt"];

export async function listGames(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  const status = parseBoolean(req.query.status);
  if (status !== undefined) filter.status = status;

  const [items, total] = await Promise.all([
    Game.find(filter as FilterQuery<IGame>).sort(sort).skip(skip).limit(limit).lean(),
    Game.countDocuments(filter as FilterQuery<IGame>),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

export async function selectGames(_req: Request, res: Response) {
  const items = await Game.find({ status: true }).select("name").sort({ name: 1 }).lean();
  return SuccessResponse(res, { items });
}

export async function getGame(req: Request, res: Response) {
  const game = await Game.findById(req.params.id).lean();
  if (!game) throw new NotFound("Game not found");

  const [actionsCount, packagesCount] = await Promise.all([
    Action.countDocuments({ game_id: game._id }),
    Package.countDocuments({ game_id: game._id }),
  ]);

  return SuccessResponse(res, {
    game,
    stats: { actions: actionsCount, packages: packagesCount },
  });
}

export async function createGame(req: Request, res: Response) {
  const game = await Game.create({
    name: req.body.name,
    status: req.body.status ?? true,
  });

  return SuccessResponse(res, { game }, 201, "Game created successfully");
}

export async function updateGame(req: Request, res: Response) {
  const game = await Game.findById(req.params.id);
  if (!game) throw new NotFound("Game not found");

  if (req.body.name !== undefined) game.name = req.body.name;
  if (req.body.status !== undefined) game.status = req.body.status;

  await game.save();

  return SuccessResponse(res, { game }, 200, "Game updated successfully");
}

export async function deleteGame(req: Request, res: Response) {
  const game = await Game.findById(req.params.id);
  if (!game) throw new NotFound("Game not found");

  const force = req.query.force === "true";
  const deletedCount = await cascadeDeleteGames([String(game._id)], force);

  return SuccessResponse(
    res,
    { id: req.params.id, deletedCount },
    200,
    "Game and all related data deleted successfully"
  );
}

export async function bulkDeleteGames(req: Request, res: Response) {
  const ids: string[] = req.body.ids;
  const force = req.query.force === "true";
  const deletedCount = await cascadeDeleteGames(ids, force);

  return SuccessResponse(
    res,
    { deletedCount },
    200,
    `${deletedCount} game(s) and their related data deleted successfully`
  );
}

/**
 * Super Admin can always remove catalog data (actions/packages) with the game.
 * Clubs subscribed to those packages are the real blocker unless `force=true`.
 */
async function cascadeDeleteGames(ids: string[], force: boolean): Promise<number> {
  const packages = await Package.find({ game_id: { $in: ids } }).select("_id").lean();
  const packageIds = packages.map((pkg) => pkg._id);

  const clubs = packageIds.length
    ? await Club.find({ package_id: { $in: packageIds } }).select("_id subdomain").lean()
    : [];

  if (clubs.length > 0 && !force) {
    throw new ConflictError(
      `Cannot delete this game: it is used by ${clubs.length} club(s). Use ?force=true to cascade delete.`
    );
  }

  if (packageIds.length > 0) {
    const clubIds = clubs.map((club) => club._id);

    if (clubIds.length > 0) {
      await Order.deleteMany({ club_id: { $in: clubIds } });
      await Club.deleteMany({ _id: { $in: clubIds } });
    }

    await Order.deleteMany({ package_id: { $in: packageIds } });
    await Package.deleteMany({ _id: { $in: packageIds } });
  }

  await Action.deleteMany({ game_id: { $in: ids } });
  const result = await Game.deleteMany({ _id: { $in: ids } });
  return result.deletedCount ?? 0;
}