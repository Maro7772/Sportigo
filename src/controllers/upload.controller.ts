import type { Request, Response } from "express";
import { Order } from "../models/Order";
import { BadRequest, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
  uploadPathFromUrl,
} from "../config/upload";

function absoluteUrl(req: Request, url: string): string {
  return `${req.protocol}://${req.get("host")}${url}`;
}

/**
 * Generic image upload.
 * `POST /api/uploads` (multipart/form-data, field: `image` or `file`)
 */
export async function uploadImage(req: Request, res: Response) {
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

/**
 * Uploads/replaces the payment proof of an order.
 * `POST /api/orders/:id/payment-proof` (multipart/form-data, field: `image`)
 */
export async function uploadOrderPaymentProof(req: Request, res: Response) {
  const file = getUploadedImage(req);

  if (!file) {
    throw new BadRequest(
      'No image uploaded. Send a multipart/form-data request with an "image" (or "file") field.'
    );
  }

  const order = await Order.findById(req.params.id);

  if (!order) {
    removeUploadedFile(file.path);
    throw new NotFound("Order not found");
  }

  const previousProof = order.payment_proof;
  const url = publicUploadUrl(file.filename);

  order.payment_proof = url;
  await order.save();

  // Replace: delete the old local file once the new one is saved.
  removeUploadedFile(uploadPathFromUrl(previousProof));

  return SuccessResponse(
    res,
    {
      order,
      payment_proof_url: absoluteUrl(req, url),
    },
    200,
    "Payment proof uploaded successfully"
  );
}
