import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Action, type IAction } from "../models/Action";
import { Game } from "../models/Game";
import { NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";

const SORT_FIELDS = ["name", "status", "createdAt", "updatedAt"];

async function assertGameExists(gameId: string): Promise<void> {
  const exists = await Game.exists({ _id: gameId });
  if (!exists) throw new NotFound("Game not found");
}

export async function listActions(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  const status = parseBoolean(req.query.status);
  if (status !== undefined) filter.status = status;

  const gameId = req.query.game_id;
  if (typeof gameId === "string" && gameId) filter.game_id = gameId;

  const [items, total] = await Promise.all([
    Action.find(filter as FilterQuery<IAction>)
      .populate("game_id", "name status")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Action.countDocuments(filter as FilterQuery<IAction>),
  ]);

  return SuccessResponse(res, {
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

export async function selectActions(req: Request, res: Response) {
  const filter: FilterQuery<IAction> = { status: true };
  if (typeof req.query.game_id === "string" && req.query.game_id) {
    filter.game_id = req.query.game_id as unknown as FilterQuery<IAction>["game_id"];
  }

  const items = await Action.find(filter).select("name game_id").sort({ name: 1 }).lean();
  return SuccessResponse(res, { items });
}

export async function getAction(req: Request, res: Response) {
  const action = await Action.findById(req.params.id)
    .populate("game_id", "name status")
    .lean();
  if (!action) throw new NotFound("Action not found");

  return SuccessResponse(res, { action });
}

export async function createAction(req: Request, res: Response) {
  await assertGameExists(req.body.game_id);

  const action = await Action.create({
    game_id: req.body.game_id,
    name: req.body.name,
    status: req.body.status ?? true,
  });

  const populated = await action.populate("game_id", "name status");

  return SuccessResponse(res, { action: populated }, 201, "Action created successfully");
}

export async function updateAction(req: Request, res: Response) {
  const action = await Action.findById(req.params.id);
  if (!action) throw new NotFound("Action not found");

  if (req.body.game_id !== undefined) {
    await assertGameExists(req.body.game_id);
    action.game_id = req.body.game_id;
  }
  if (req.body.name !== undefined) action.name = req.body.name;
  if (req.body.status !== undefined) action.status = req.body.status;

  await action.save();

  return SuccessResponse(res, { action }, 200, "Action updated successfully");
}

export async function deleteAction(req: Request, res: Response) {
  const action = await Action.findById(req.params.id);
  if (!action) throw new NotFound("Action not found");

  await action.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Action deleted successfully");
}

export async function bulkDeleteActions(req: Request, res: Response) {
  const result = await Action.deleteMany({ _id: { $in: req.body.ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} action(s) deleted successfully`
  );
}
