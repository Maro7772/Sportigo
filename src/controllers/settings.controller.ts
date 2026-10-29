import type { Request, Response } from "express";
import { getOrCreateSettings, Settings } from "../models/Settings";
import { SuccessResponse } from "../utils/response";

export async function getSettings(_req: Request, res: Response) {
  const settings = await getOrCreateSettings();
  return SuccessResponse(res, { settings });
}

export async function updateSettings(req: Request, res: Response) {
  const updated = await Settings.findOneAndUpdate(
    { key: "global" },
    { $set: req.body },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  return SuccessResponse(res, { settings: updated }, 200, "Settings updated successfully");
}
