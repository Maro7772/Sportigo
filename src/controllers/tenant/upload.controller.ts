import type { Request, Response } from "express";
import { Order } from "../../models/Order";
import { BadRequest, ForbiddenError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
  uploadPathFromUrl,
} from "../../config/upload";

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

/**
 * `POST /api/tenant/cart/:id/payment-proof` (multipart/form-data, field: `image`)
 * Attaches the club's payment screenshot to the order created by the checkout.
 */
export async function uploadCartPaymentProof(req: Request, res: Response) {
  const models = tenantModels(req);
  const { club } = tenantContext(req);

  const file = getUploadedImage(req);

  if (!file) {
    throw new BadRequest(
      'No image uploaded. Send a multipart/form-data request with an "image" (or "file") field.'
    );
  }

  const cart = await models.Cart.findById(req.params.id);
  if (!cart) {
    removeUploadedFile(file.path);
    throw new NotFound("Cart item not found");
  }

  if (!cart.order_id) {
    removeUploadedFile(file.path);
    throw new BadRequest("Check the cart out first, then upload the payment proof");
  }

  const order = await Order.findById(cart.order_id);
  if (!order) {
    removeUploadedFile(file.path);
    throw new NotFound("Order not found");
  }

  if (String(order.club_id) !== String(club._id)) {
    removeUploadedFile(file.path);
    throw new ForbiddenError("This order belongs to another club");
  }

  const previousProof = order.payment_proof;
  const url = publicUploadUrl(file.filename);

  order.payment_proof = url;
  await order.save();

  removeUploadedFile(uploadPathFromUrl(previousProof));

  return SuccessResponse(
    res,
    { cart, order, payment_proof_url: absoluteUrl(req, url) },
    200,
    "Payment proof uploaded successfully"
  );
}
