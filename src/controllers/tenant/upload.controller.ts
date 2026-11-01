import type { Request, Response } from "express";
import { BadRequest } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { getUploadedImage, publicUploadUrl } from "../../config/upload";

function absoluteUrl(req: Request, url: string): string {
  return `${req.protocol}://${req.get("host")}${url}`;
}

/** `POST /api/tenant/uploads` (multipart/form-data, field: `image` or `file`) */
export async function uploadTenantImage(req: Request, res: Response) {
  const file = getUploadedImage(req);

  if (!file) {
    throw new BadRequest(
      'No image uploaded. Send a multipart/form-data request with an "image" (or "file") field.'
    );
  }

  const url = publicUploadUrl(file.filename);

  return SuccessResponse(
    res,
    {
      file: {
        filename: file.filename,
        original_name: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url,
        absolute_url: absoluteUrl(req, url),
      },
    },
    201,
    "Image uploaded successfully"
  );
}
