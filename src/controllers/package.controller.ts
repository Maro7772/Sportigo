import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Package, type IPackage, type IPackageCycle } from "../models/Package";
import { Game } from "../models/Game";
import { Club } from "../models/Club";
import { Order } from "../models/Order";
import { BadRequest, ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";

const SORT_FIELDS = ["name", "status", "createdAt", "updatedAt"];

async function assertGameExists(gameId: string): Promise<void> {
  const exists = await Game.exists({ _id: gameId });
  if (!exists) throw new NotFound("Game not found");
}

function assertUniqueCycleNames(cycles: { name: string }[]): void {
  const names = cycles.map((cycle) => cycle.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    throw new BadRequest("Cycle names must be unique inside the same package");
  }
}

/**
 * Keeps existing cycle `_id`s when the client edits a package.
 * Matching is done by `_id` first, then by name, so orders that reference a
 * cycle keep working after a price/name update.
 */
function mergeCycleIds(
  incoming: IPackageCycle[],
  existing: IPackageCycle[]
): IPackageCycle[] {
  return incoming.map((cycle) => {
    const byId = cycle._id
      ? existing.find((item) => String(item._id) === String(cycle._id))
      : undefined;

    const byName = existing.find(
      (item) => item.name.trim().toLowerCase() === cycle.name.trim().toLowerCase()
    );

    const matched = byId ?? byName;
    return matched ? { ...cycle, _id: matched._id } : cycle;
  });
}

export async function listPackages(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  const status = parseBoolean(req.query.status);
  if (status !== undefined) filter.status = status;

  if (typeof req.query.game_id === "string" && req.query.game_id) {
    filter.game_id = req.query.game_id;
  }

  const [items, total] = await Promise.all([
    Package.find(filter as FilterQuery<IPackage>)
      .populate("game_id", "name status")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Package.countDocuments(filter as FilterQuery<IPackage>),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

export async function selectPackages(req: Request, res: Response) {
  const filter: Record<string, unknown> = { status: true };
  if (typeof req.query.game_id === "string" && req.query.game_id) {
    filter.game_id = req.query.game_id;
  }

  const items = await Package.find(filter)
    .select("name game_id teams players cycles")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}

export async function getPackage(req: Request, res: Response) {
  const pkg = await Package.findById(req.params.id)
    .populate("game_id", "name status")
    .lean();
  if (!pkg) throw new NotFound("Package not found");

  const clubsCount = await Club.countDocuments({ package_id: pkg._id });

  return SuccessResponse(res, { package: pkg, stats: { clubs: clubsCount } });
}

export async function createPackage(req: Request, res: Response) {
  await assertGameExists(req.body.game_id);
  assertUniqueCycleNames(req.body.cycles);

  const pkg = await Package.create({
    name: req.body.name,
    status: req.body.status ?? true,
    game_id: req.body.game_id,
    teams: req.body.teams ?? 0,
    players: req.body.players ?? 0,
    cycles: req.body.cycles,
  });

  const populated = await pkg.populate("game_id", "name status");

  return SuccessResponse(res, { package: populated }, 201, "Package created successfully");
}

export async function updatePackage(req: Request, res: Response) {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) throw new NotFound("Package not found");

  if (req.body.game_id !== undefined) {
    await assertGameExists(req.body.game_id);
    pkg.game_id = req.body.game_id;
  }
  if (req.body.cycles !== undefined) {
    assertUniqueCycleNames(req.body.cycles);
    pkg.set("cycles", mergeCycleIds(req.body.cycles, pkg.cycles));
  }
  if (req.body.name !== undefined) pkg.name = req.body.name;
  if (req.body.status !== undefined) pkg.status = req.body.status;
  if (req.body.teams !== undefined) pkg.teams = req.body.teams;
  if (req.body.players !== undefined) pkg.players = req.body.players;

  await pkg.save();

  return SuccessResponse(res, { package: pkg }, 200, "Package updated successfully");
}

export async function deletePackage(req: Request, res: Response) {
  const pkg = await Package.findById(req.params.id);
  if (!pkg) throw new NotFound("Package not found");

  const [clubsCount, ordersCount] = await Promise.all([
    Club.countDocuments({ package_id: pkg._id }),
    Order.countDocuments({ package_id: pkg._id }),
  ]);

  if (clubsCount > 0 || ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete this package: it is assigned to ${clubsCount} club(s) and used by ${ordersCount} order(s)`
    );
  }

  await pkg.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Package deleted successfully");
}

export async function bulkDeletePackages(req: Request, res: Response) {
  const ids: string[] = req.body.ids;

  const [clubsCount, ordersCount] = await Promise.all([
    Club.countDocuments({ package_id: { $in: ids } }),
    Order.countDocuments({ package_id: { $in: ids } }),
  ]);

  if (clubsCount > 0 || ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete: some packages are assigned to ${clubsCount} club(s) and used by ${ordersCount} order(s)`
    );
  }

  const result = await Package.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} package(s) deleted successfully`
  );
}
