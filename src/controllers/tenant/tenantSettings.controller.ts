import type { Request, Response } from "express";
import { getOrCreateTenantSettings } from "../../models/tenant";
import { BadRequest } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { tenantModels } from "../../middlewares/tenant";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
  uploadPathFromUrl,
} from "../../config/upload";

/** `GET /api/tenant/settings` */
export async function getTenantSettings(req: Request, res: Response) {
  const settings = await getOrCreateTenantSettings(tenantModels(req));
  return SuccessResponse(res, { settings });
}

/** `PUT|PATCH /api/tenant/settings` */
export async function updateTenantSettings(req: Request, res: Response) {
  const models = tenantModels(req);
  const settings = await getOrCreateTenantSettings(models);

  if (req.body.logo !== undefined) settings.logo = req.body.logo;
  if (req.body.background_color !== undefined) {
    settings.background_color = req.body.background_color;
  }
  if (req.body.color !== undefined) settings.color = req.body.color;

  await settings.save();

  return SuccessResponse(res, { settings }, 200, "Settings updated successfully");
}

/**
 * `POST /api/tenant/settings/logo` (multipart/form-data, field: `image`)
 * Replaces the previous logo and deletes the old local file.
 */
export async function uploadTenantLogo(req: Request, res: Response) {
  const file = getUploadedImage(req);

  if (!file) {
    throw new BadRequest(
      'No image uploaded. Send a multipart/form-data request with an "image" (or "file") field.'
    );
  }

  const models = tenantModels(req);
  const settings = await getOrCreateTenantSettings(models);
  const previousLogo = settings.logo;

  const url = publicUploadUrl(file.filename);
  settings.logo = url;
  await settings.save();

  removeUploadedFile(uploadPathFromUrl(previousLogo));

  return SuccessResponse(
    res,
    { settings, logo_url: url },
    200,
    "Logo uploaded successfully"
  );
}
