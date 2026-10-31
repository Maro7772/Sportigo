import type { Request, Response } from "express";
import { Game } from "../../models/Game";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";

const SORT_FIELDS = ["name", "createdAt", "updatedAt"];

/** `GET /api/tenant/games` (read-only list of central games). */
export async function listTenantGames(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  const [items, total] = await Promise.all([
    Game.find(filter as any)
      .select("name status")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Game.countDocuments(filter as any),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/games/select` (dropdown). */
export async function selectTenantGames(_req: Request, res: Response) {
  const items = await Game.find({ status: true })
    .select("name")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}