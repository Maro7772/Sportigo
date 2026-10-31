import type { Request, Response } from "express";
import { getOrCreateTenantSettings } from "../../models/tenant";
import { getUploadedImage, publicUploadUrl, removeUploadedFile, uploadPathFromUrl } from "../../config/upload";
import { BadRequest } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { tenantModels } from "../../middlewares/tenant";

/** `GET /api/tenant/settings` */
export async function getTenantSettings(req: Request, res: Response) {
  const settings = await getOrCreateTenantSettings(tenantModels(req));
  return SuccessResponse(res, { settings });
}

/**
 * `POST|PUT|PATCH /api/tenant/settings`
 * Accepts JSON (`logo` URL + colors) or multipart/form-data (logo file + colors)
 * in the same request. Replaces the previous logo and deletes the old local file.
 */
export async function updateTenantSettings(req: Request, res: Response) {
  const models = tenantModels(req);
  const settings = await getOrCreateTenantSettings(models);

  const file = getUploadedImage(req);
  if (file) {
    const previousLogo = settings.logo;
    const url = publicUploadUrl(file.filename);
    settings.logo = url;
    if (previousLogo && previousLogo !== url) {
      removeUploadedFile(uploadPathFromUrl(previousLogo));
    }
  }

  if (req.body.logo !== undefined) settings.logo = req.body.logo;
  if (req.body.background_color !== undefined) {
    settings.background_color = req.body.background_color;
  }
  if (req.body.color !== undefined) settings.color = req.body.color;

  if (
    !file &&
    req.body.logo === undefined &&
    req.body.background_color === undefined &&
    req.body.color === undefined
  ) {
    throw new BadRequest("At least one field or a logo file is required");
  }

  await settings.save();

  return SuccessResponse(res, { settings }, 200, "Settings updated successfully");
}
