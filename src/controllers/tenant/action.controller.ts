import type { Request, Response } from "express";
import { Action } from "../../models/Action";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";

const SORT_FIELDS = ["name", "createdAt", "updatedAt"];

/** `GET /api/tenant/actions` (read-only central actions, filterable by game_id). */
export async function listTenantActions(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  if (typeof req.query.game_id === "string" && req.query.game_id.trim()) {
    filter.game_id = req.query.game_id.trim();
  }

  const [items, total] = await Promise.all([
    Action.find(filter as any)
      .select("name game_id status")
      .populate("game_id", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Action.countDocuments(filter as any),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/actions/select` (dropdown, optionally by game_id). */
export async function selectTenantActions(req: Request, res: Response) {
  const filter: Record<string, unknown> = { status: true };
  if (typeof req.query.game_id === "string" && req.query.game_id.trim()) {
    filter.game_id = req.query.game_id.trim();
  }

  const items = await Action.find(filter)
    .select("name game_id")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}