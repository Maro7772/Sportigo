import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Game, type IGame } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { Club } from "../models/Club"; // 👈 ضفنا الكلوب
import { Order } from "../models/Order"; // 👈 ضفنا الأوردر
import { ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";
import { dropTenantDatabase } from "../config/tenant"; // لو محتاج تمسح الداتابيز بتاعت النادي

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

  const force = req.query.force === "true"; // 👈 بنشوف لو المستخدم طالب حذف إجباري

  const [actionsCount, packagesCount] = await Promise.all([
    Action.countDocuments({ game_id: game._id }),
    Package.countDocuments({ game_id: game._id }),
  ]);

  // لو مفيش force ومفيش حاجات مرتبطة، أو لو فيه force هنمسح
  if (!force && (actionsCount > 0 || packagesCount > 0)) {
    throw new ConflictError(
      `Cannot delete this game: it is used by ${actionsCount} action(s) and ${packagesCount} package(s). Use ?force=true to cascade delete.`
    );
  }

  // 1. نجيب كل الباكدجات اللي مرتبطة باللعبة دي
  const packages = await Package.find({ game_id: game._id }).select("_id").lean();
  const packageIds = packages.map(p => p._id);

  if (packageIds.length > 0) {
    // 2. نشوف فيه كلوبات بتستخدم الباكدجات دي ولا لأ
    const clubs = await Club.find({ package_id: { $in: packageIds } }).select("_id subdomain").lean();
    const clubIds = clubs.map(c => c._id);

    if (clubIds.length > 0) {
      // 3. نمسح الأوردرات اللي بتخص الكلوبات دي
      await Order.deleteMany({ club_id: { $in: clubIds } });
      
      // 4. نمسح الكلوبات نفسها (اختياري: ممكن تمسح الـ tenant databases كمان)
      await Club.deleteMany({ _id: { $in: clubIds } });
      
      // (لو عايز تمسح الـ tenant databases بتاعت الكلوبات دي، فعل السطر ده:)
      // for (const club of clubs) {
      //   await dropTenantDatabase(club.subdomain).catch(() => {});
      // }
    }

    // 5. نمسح الأوردرات المتبقية اللي بتشاور على الباكدجات دي (لو فيه أوردرات مش مرتبطة بكلوب)
    await Order.deleteMany({ package_id: { $in: packageIds } });

    // 6. نمسح الباكدجات
    await Package.deleteMany({ _id: { $in: packageIds } });
  }

  // 7. نمسح الأكشنز
  await Action.deleteMany({ game_id: game._id });

  // 8. أخيراً نمسح اللعبة
  await game.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Game and all related data deleted successfully");
}

export async function bulkDeleteGames(req: Request, res: Response) {
  const ids: string[] = req.body.ids;
  const force = req.query.force === "true"; // 👈 بنشوف لو المستخدم طالب حذف إجباري

  const [actionsCount, packagesCount] = await Promise.all([
    Action.countDocuments({ game_id: { $in: ids } }),
    Package.countDocuments({ game_id: { $in: ids } }),
  ]);

  if (!force && (actionsCount > 0 || packagesCount > 0)) {
    throw new ConflictError(
      `Cannot delete: some games are used by ${actionsCount} action(s) and ${packagesCount} package(s). Use ?force=true to cascade delete.`
    );
  }

  // 1. نجيب الباكدجات
  const packages = await Package.find({ game_id: { $in: ids } }).select("_id").lean();
  const packageIds = packages.map(p => p._id);

  if (packageIds.length > 0) {
    // 2. نجيب الكلوبات
    const clubs = await Club.find({ package_id: { $in: packageIds } }).select("_id subdomain").lean();
    const clubIds = clubs.map(c => c._id);

    if (clubIds.length > 0) {
      // 3. نمسح الأوردرات والكلوبات
      await Order.deleteMany({ club_id: { $in: clubIds } });
      await Club.deleteMany({ _id: { $in: clubIds } });
      
      // for (const club of clubs) { await dropTenantDatabase(club.subdomain).catch(() => {}); }
    }

    // 5. نمسح الأوردرات والباكدجات
    await Order.deleteMany({ package_id: { $in: packageIds } });
    await Package.deleteMany({ _id: { $in: packageIds } });
  }

  // 7. نمسح الأكشنز
  await Action.deleteMany({ game_id: { $in: ids } });

  // 8. نمسح الألعاب
  const result = await Game.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} game(s) and their related data deleted successfully`
  );
}