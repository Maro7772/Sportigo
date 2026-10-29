import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { PaymentMethod, type IPaymentMethod } from "../models/PaymentMethod";
import { Order } from "../models/Order";
import { ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery, parseBoolean } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";

const SORT_FIELDS = ["name", "status", "createdAt", "updatedAt"];

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
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

export async function selectPaymentMethods(_req: Request, res: Response) {
  const items = await PaymentMethod.find({ status: true })
    .select("name description")
    .sort({ name: 1 })
    .lean();

  return SuccessResponse(res, { items });
}

export async function getPaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.findById(req.params.id).lean();
  if (!paymentMethod) throw new NotFound("Payment method not found");

  return SuccessResponse(res, { payment_method: paymentMethod });
}

export async function createPaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.create({
    name: req.body.name,
    status: req.body.status ?? true,
    description: req.body.description ?? null,
  });

  return SuccessResponse(
    res,
    { payment_method: paymentMethod },
    201,
    "Payment method created successfully"
  );
}

export async function updatePaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.findById(req.params.id);
  if (!paymentMethod) throw new NotFound("Payment method not found");

  if (req.body.name !== undefined) paymentMethod.name = req.body.name;
  if (req.body.status !== undefined) paymentMethod.status = req.body.status;
  if (req.body.description !== undefined) paymentMethod.description = req.body.description;

  await paymentMethod.save();

  return SuccessResponse(
    res,
    { payment_method: paymentMethod },
    200,
    "Payment method updated successfully"
  );
}

export async function deletePaymentMethod(req: Request, res: Response) {
  const paymentMethod = await PaymentMethod.findById(req.params.id);
  if (!paymentMethod) throw new NotFound("Payment method not found");

  const ordersCount = await Order.countDocuments({ payment_method_id: paymentMethod._id });
  if (ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete this payment method: it is used by ${ordersCount} order(s). Deactivate it instead.`
    );
  }

  await paymentMethod.deleteOne();

  return SuccessResponse(
    res,
    { id: req.params.id },
    200,
    "Payment method deleted successfully"
  );
}

export async function bulkDeletePaymentMethods(req: Request, res: Response) {
  const ids: string[] = req.body.ids;

  const ordersCount = await Order.countDocuments({ payment_method_id: { $in: ids } });
  if (ordersCount > 0) {
    throw new ConflictError(
      `Cannot delete: some payment methods are used by ${ordersCount} order(s). Deactivate them instead.`
    );
  }

  const result = await PaymentMethod.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} payment method(s) deleted successfully`
  );
}
