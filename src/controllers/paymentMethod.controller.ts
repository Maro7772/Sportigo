import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { PaymentMethod, type IPaymentMethod } from "../models/PaymentMethod";
import { Order } from "../models/Order";
import { BadRequest, ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
  uploadPathFromUrl,
} from "../config/upload";

const SORT_FIELDS = ["name", "status", "createdAt", "updatedAt"];

/**
 * Resolves the icon value from the request.
 *
 * Priority:
 *  1. Multipart file (`req.file` from `upload.single("icon")`) — preferred.
 *  2. JSON / form string `icon` field:
 *       - `"null"` or `""`  → clear the icon
 *       - any other string  → use it as-is (URL)
 *  3. Missing → `undefined` (leave unchanged on update, null on create).
 */
function resolveIcon(req: Request): {
  value: string | null | undefined;
  uploadedPath?: string;
} {
  const file = getUploadedImage(req);
  if (file) {
    return { value: publicUploadUrl(file.filename), uploadedPath: file.path };
  }

  const raw = (req.body as Record<string, unknown>)?.icon;
  if (raw === undefined) return { value: undefined };
  if (raw === null) return { value: null };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "null") return { value: null };
    return { value: trimmed };
  }

  return { value: undefined };
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export async function listPaymentMethods(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["name", "description"],
    sortFields: SORT_FIELDS,
    defaultSort: "name",
    defaultOrder: 1,
  });

  const status = parseBoolean(req.query.status);
  if (status !== undefined) filter.status = status;

  const [items, total] = await Promise.all([
    PaymentMethod.find(filter as FilterQuery<IPaymentMethod>)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    PaymentMethod.countDocuments(filter as FilterQuery<IPaymentMethod>),
  ]);

  return SuccessResponse(res, {
    items: items.map((item) => ({ ...item, icon_url: item.icon })),
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Select                                   */
/* -------------------------------------------------------------------------- */

export async function selectPaymentMethods(_req: Request, res: Response) {
  const items = await PaymentMethod.find({ status: true })
    .select("name description icon")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, {
    items: items.map((item) => ({ ...item, icon_url: item.icon })),
  });
}

/* -------------------------------------------------------------------------- */
/*                                    Get                                     */
/* -------------------------------------------------------------------------- */

export async function getPaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.findById(req.params.id).lean();
  if (!paymentMethod) throw new NotFound("Payment method not found");

  return SuccessResponse(res, {
    payment_method: { ...paymentMethod, icon_url: paymentMethod.icon },
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

export async function createPaymentMethod(req: Request, res: Response) {
  const { value: icon, uploadedPath } = resolveIcon(req);

  let created: any;
  try {
    created = await PaymentMethod.create({
      name: req.body.name,
      status: req.body.status ?? true,
      description: req.body.description ?? null,
      icon: icon ?? null,
    });
  } catch (error) {
    // Roll back the uploaded file if the DB write failed
    if (uploadedPath) removeUploadedFile(uploadedPath);
    throw error;
  }

  return SuccessResponse(
    res,
    {
      payment_method: {
        ...created.toObject(),
        icon_url: created.icon,
      },
    },
    201,
    "Payment method created successfully"
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Update                                   */
/* -------------------------------------------------------------------------- */

export async function updatePaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.findById(req.params.id);
  if (!paymentMethod) throw new NotFound("Payment method not found");

  const hasFile = Boolean(getUploadedImage(req));
  const hasBodyFields = Object.keys(req.body ?? {}).length > 0;
  if (!hasFile && !hasBodyFields) {
    throw new BadRequest("At least one field or an icon file is required");
  }

  if (req.body.name !== undefined) paymentMethod.name = req.body.name;
  if (req.body.status !== undefined) paymentMethod.status = req.body.status;
  if (req.body.description !== undefined) paymentMethod.description = req.body.description;

  const { value: newIcon, uploadedPath } = resolveIcon(req);
  const previousIcon = paymentMethod.icon;
  const iconChanged = newIcon !== undefined && newIcon !== previousIcon;

  if (newIcon !== undefined) paymentMethod.icon = newIcon;

  try {
    await paymentMethod.save();
  } catch (error) {
    // If the DB failed, delete the freshly uploaded file to keep disk clean
    if (uploadedPath) removeUploadedFile(uploadedPath);
    throw error;
  }

  // Delete the previous local file only after the new value is persisted
  if (iconChanged && previousIcon) {
    removeUploadedFile(uploadPathFromUrl(previousIcon));
  }

  return SuccessResponse(
    res,
    {
      payment_method: {
        ...paymentMethod.toObject(),
        icon_url: paymentMethod.icon,
      },
    },
    200,
    "Payment method updated successfully"
  );
}

/* -------------------------------------------------------------------------- */
/*                                   Delete                                   */
/* -------------------------------------------------------------------------- */

export async function deletePaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.findById(req.params.id);
  if (!paymentMethod) throw new NotFound("Payment method not found");

  const ordersCount = await Order.countDocuments({ payment_method_id: paymentMethod._id });
  if (ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete this payment method: it is used by ${ordersCount} order(s). Deactivate it instead.`
    );
  }

  // Cleanup the icon file from disk
  removeUploadedFile(uploadPathFromUrl(paymentMethod.icon));

  await paymentMethod.deleteOne();

  return SuccessResponse(
    res,
    { id: req.params.id },
    200,
    "Payment method deleted successfully"
  );
}

/* -------------------------------------------------------------------------- */
/*                                Bulk Delete                                 */
/* -------------------------------------------------------------------------- */

export async function bulkDeletePaymentMethods(req: Request, res: Response) {
  const ids: string[] = req.body.ids;

  const ordersCount = await Order.countDocuments({ payment_method_id: { $in: ids } });
  if (ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete: some payment methods are used by ${ordersCount} order(s). Deactivate them instead.`
    );
  }

  // Grab icons before deleting so we can clean up files
  const methods = await PaymentMethod.find({ _id: { $in: ids } })
    .select("icon")
    .lean();

  const result = await PaymentMethod.deleteMany({ _id: { $in: ids } });

  for (const m of methods) {
    removeUploadedFile(uploadPathFromUrl(m.icon));
  }

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} payment method(s) deleted successfully`
  );
}