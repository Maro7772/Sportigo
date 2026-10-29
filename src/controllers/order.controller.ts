import { Types, type FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Order, type IOrder } from "../models/Order";
import { Package, type IPackageCycle } from "../models/Package";
import { Club } from "../models/Club";
import { PaymentMethod } from "../models/PaymentMethod";
import { SuperAdmin } from "../models/SuperAdmin";
import { getOrCreateSettings } from "../models/Settings";
import { BadRequest, ConflictError, NotFound } from "../errors";
import { SuccessResponse } from "../utils/response";
import { buildListQuery } from "../utils/listQuery";
import { buildPaginationMeta } from "../utils/pagination";
import { calculateDiscountAmount } from "../utils/pricing";
import {
  applyPaidOrder,
  evaluateSubscription,
} from "../services/subscription.service";
import { buildInvoiceData, renderInvoiceHtml } from "../services/invoice.service";
import { serializeOrder } from "../utils/orderSerializer";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
  uploadPathFromUrl,
} from "../config/upload";

const SORT_FIELDS = [
  "order_number",
  "price",
  "discount",
  "fine",
  "final_price",
  "status",
  "applied_to_subscription",
  "createdAt",
  "updatedAt",
];

/**
 * Only the fields we actually display.
 * club/package/payment_method → `{ name }` only.
 * approved_by → `{ name }` only (used only when NOT relying on the snapshot).
 */
const ORDER_POPULATE = [
  { path: "club_id", select: "name" },
  { path: "package_id", select: "name" },
  { path: "payment_method_id", select: "name" },
  { path: "approved_by", select: "name" },
];

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

async function getClubOrThrow(clubId: string) {
  const club = await Club.findById(clubId);
  if (!club) throw new NotFound("Club not found");
  return club;
}

async function assertPaymentMethodExists(paymentMethodId: string): Promise<void> {
  const exists = await PaymentMethod.exists({ _id: paymentMethodId });
  if (!exists) throw new NotFound("Payment method not found");
}

function findCycle(
  pkg: { cycles: IPackageCycle[] },
  cycleId: string | null
): IPackageCycle | undefined {
  if (!cycleId) return undefined;
  return pkg.cycles.find((cycle) => String(cycle._id) === cycleId);
}

/**
 * Loads the populated order and returns it serialized through `serializeOrder`.
 * Throws 404 if it doesn't exist.
 */
async function fetchSerializedOrder(req: Request, orderId: string) {
  const order = await Order.findById(orderId).populate(ORDER_POPULATE).lean();
  if (!order) throw new NotFound("Order not found");
  return serializeOrder(req, order);
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export async function listOrders(req: Request, res: Response) {
  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["order_number", "payment_reference", "notes"],
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  for (const field of [
    "club_id",
    "package_id",
    "payment_method_id",
    "status",
    "order_number",
  ] as const) {
    const value = req.query[field];
    if (typeof value === "string" && value) filter[field] = value;
  }

  const [items, total] = await Promise.all([
    Order.find(filter as FilterQuery<IOrder>)
      .populate(ORDER_POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter as FilterQuery<IOrder>),
  ]);

  return SuccessResponse(res, {
    items: items.map((order) => serializeOrder(req, order)),
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/* -------------------------------------------------------------------------- */
/*                                    Get                                     */
/* -------------------------------------------------------------------------- */

export async function getOrder(req: Request, res: Response) {
  const order = await fetchSerializedOrder(req, String(req.params.id));
  return SuccessResponse(res, { order });
}

/* -------------------------------------------------------------------------- */
/*                                   Create                                   */
/* -------------------------------------------------------------------------- */

export async function createOrder(req: Request, res: Response) {
  const { club_id, package_id, cycle_id, payment_method_id } = req.body;

  const [club, paymentMethodExists, pkg, settings] = await Promise.all([
    getClubOrThrow(club_id),
    PaymentMethod.exists({ _id: payment_method_id }),
    Package.findById(package_id),
    getOrCreateSettings(),
  ]);

  if (!paymentMethodExists) throw new NotFound("Payment method not found");
  if (!pkg) throw new NotFound("Package not found");

  const cycle = cycle_id ? findCycle(pkg, cycle_id) : undefined;
  if (cycle_id && !cycle) {
    throw new BadRequest("Cycle does not belong to the selected package");
  }

  const price = req.body.price ?? cycle?.price;
  if (price === undefined) {
    throw new BadRequest("price is required when no cycle is selected");
  }

  const discount =
    req.body.discount ??
    (cycle
      ? calculateDiscountAmount(price, cycle.discount, cycle.discount_type)
      : 0);

  if (discount > price) throw new BadRequest("discount cannot be greater than price");

  const subscription = evaluateSubscription(club, settings.allowed_days);
  const fine =
    req.body.fine ?? (subscription.is_late_renewal ? settings.fines : 0);

  // 👇 payment_proof: file upload (multipart) takes precedence over a URL
  const file = getUploadedImage(req);
  const uploadedProofUrl = file ? publicUploadUrl(file.filename) : null;
  const finalProof = req.body.payment_proof ?? uploadedProofUrl ?? null;

  let order: any;
  try {
    order = await Order.create({
      club_id,
      package_id,
      cycle_id: cycle_id ?? cycle?._id ?? null,
      cycle_name: cycle?.name ?? null, // 👈 snapshot
      payment_method_id,
      price,
      discount,
      fine,
      status: req.body.status ?? "pending",
      payment_proof: finalProof,
      payment_reference: req.body.payment_reference ?? null,
      paid_at: req.body.paid_at ?? null,
      notes: req.body.notes ?? null,
    });
  } catch (error) {
    // Rollback the uploaded file if the DB write fails
    if (file) removeUploadedFile(file.path);
    throw error;
  }

  if (order.status === "paid") {
    await applyPaidOrder(String(order._id));
  }

  const serialized = await fetchSerializedOrder(req, String(order._id));

  return SuccessResponse(res, { order: serialized }, 201, "Order created successfully");
}

/* -------------------------------------------------------------------------- */
/*                                   Update                                   */
/* -------------------------------------------------------------------------- */

export async function updateOrder(req: Request, res: Response) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFound("Order not found");

  if (
    order.applied_to_subscription &&
    req.body.status !== undefined &&
    req.body.status !== "paid"
  ) {
    throw new ConflictError(
      "This order was already applied to the club subscription and cannot be moved out of paid status"
    );
  }

  if (req.body.club_id !== undefined) {
    const club = await getClubOrThrow(req.body.club_id);
    order.club_id = club._id;
  }

  if (req.body.payment_method_id !== undefined) {
    await assertPaymentMethodExists(req.body.payment_method_id);
    order.payment_method_id = req.body.payment_method_id;
  }

  const packageChanged =
    req.body.package_id !== undefined &&
    String(req.body.package_id) !== String(order.package_id);
  const packageId = req.body.package_id ?? String(order.package_id);

  let pkg = null;
  if (packageChanged || req.body.cycle_id !== undefined) {
    pkg = await Package.findById(packageId);
    if (!pkg) throw new NotFound("Package not found");
  }

  if (packageChanged) order.package_id = pkg!._id;

  const cycleProvided = req.body.cycle_id !== undefined;
  let nextCycleId: string | null = order.cycle_id ? String(order.cycle_id) : null;

  if (packageChanged) {
    nextCycleId = cycleProvided ? req.body.cycle_id : null;
  } else if (cycleProvided) {
    nextCycleId = req.body.cycle_id;
  }

  let cycle: IPackageCycle | undefined;
  if (nextCycleId && pkg) {
    cycle = findCycle(pkg, nextCycleId);
    if (!cycle) throw new BadRequest("Cycle does not belong to the selected package");
  }

  if (packageChanged || cycleProvided) {
    order.cycle_id = nextCycleId ? new Types.ObjectId(nextCycleId) : null;
    order.cycle_name = cycle?.name ?? null; // 👈 keep snapshot in sync
  }

  if (req.body.price !== undefined) order.price = req.body.price;

  if (packageChanged || cycleProvided) {
    if (req.body.price === undefined) {
      if (cycle) {
        order.price = cycle.price;
      } else if (packageChanged) {
        throw new BadRequest(
          "price is required when changing to a package without a cycle"
        );
      }
    }
  }

  if (req.body.discount !== undefined) {
    order.discount = req.body.discount;
  } else if (cycle) {
    order.discount = calculateDiscountAmount(
      order.price,
      cycle.discount,
      cycle.discount_type
    );
  } else if (packageChanged) {
    order.discount = 0;
  }

  if (req.body.fine !== undefined) order.fine = req.body.fine;

  // 👇 payment_proof: file upload (multipart) OR explicit URL
  const file = getUploadedImage(req);
  if (file || req.body.payment_proof !== undefined) {
    const newProof = req.body.payment_proof ?? publicUploadUrl(file!.filename);
    const previousProof = order.payment_proof;
    order.payment_proof = newProof;

    try {
      if (req.body.status !== undefined) order.status = req.body.status;
      if (req.body.paid_at !== undefined) order.paid_at = req.body.paid_at;
      if (req.body.notes !== undefined) order.notes = req.body.notes;
      if (req.body.payment_reference !== undefined) {
        order.payment_reference = req.body.payment_reference;
      }

      if (order.discount > order.price) {
        throw new BadRequest("discount cannot be greater than price");
      }

      await order.save();

      // Cleanup the previous proof AFTER the new one is persisted
      if (previousProof && previousProof !== newProof) {
        removeUploadedFile(uploadPathFromUrl(previousProof));
      }
    } catch (error) {
      if (file) removeUploadedFile(file.path);
      throw error;
    }
  } else {
    if (req.body.status !== undefined) order.status = req.body.status;
    if (req.body.paid_at !== undefined) order.paid_at = req.body.paid_at;
    if (req.body.notes !== undefined) order.notes = req.body.notes;
    if (req.body.payment_reference !== undefined) {
      order.payment_reference = req.body.payment_reference;
    }

    if (order.discount > order.price) {
      throw new BadRequest("discount cannot be greater than price");
    }

    await order.save();
  }

  if (order.status === "paid") {
    await applyPaidOrder(String(order._id));
  }

  const serialized = await fetchSerializedOrder(req, String(order._id));

  return SuccessResponse(res, { order: serialized }, 200, "Order updated successfully");
}

/* -------------------------------------------------------------------------- */
/*                                Update Status                               */
/* -------------------------------------------------------------------------- */

export async function updateOrderStatus(req: Request, res: Response) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFound("Order not found");

  if (order.applied_to_subscription && req.body.status !== "paid") {
    throw new ConflictError(
      "This order was already applied to the club subscription and cannot be moved out of paid status"
    );
  }

  if (
    order.status === "paid" &&
    (req.body.status === "pending" || req.body.status === "rejected")
  ) {
    throw new ConflictError(
      `A paid order cannot be moved back to "${req.body.status}". Use refund/cancel instead.`
    );
  }

  order.status = req.body.status;
  await order.save();

  if (order.status === "paid") {
    await applyPaidOrder(String(order._id));
  }

  const serialized = await fetchSerializedOrder(req, String(order._id));

  return SuccessResponse(
    res,
    { order: serialized },
    200,
    "Order status updated successfully"
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Approve                                   */
/* -------------------------------------------------------------------------- */

export async function approveOrder(req: Request, res: Response) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFound("Order not found");

  if (order.status === "paid") {
    throw new ConflictError("This order is already approved");
  }

  if (order.status !== "pending") {
    throw new ConflictError(
      `Only pending orders can be approved (current status: ${order.status})`
    );
  }

  const now = new Date();

  order.status = "paid";
  order.paid_at = now;
  order.approved_at = now;
  order.approved_by = req.user?.sub ? new Types.ObjectId(req.user.sub) : null;

  // 👇 snapshot اسم الـ super admin
  if (req.user?.sub) {
    const admin = await SuperAdmin.findById(req.user.sub).select("name").lean();
    order.approved_by_name = admin?.name ?? null;
  }

  if (req.body?.notes !== undefined) {
    order.review_notes = req.body.notes;
  }

  await order.save();
  await applyPaidOrder(String(order._id));

  const serialized = await fetchSerializedOrder(req, String(order._id));

  return SuccessResponse(res, { order: serialized }, 200, "Order approved successfully");
}

/* -------------------------------------------------------------------------- */
/*                                   Reject                                   */
/* -------------------------------------------------------------------------- */

export async function rejectOrder(req: Request, res: Response) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFound("Order not found");

  if (order.applied_to_subscription) {
    throw new ConflictError(
      "This order was already applied to the club subscription and cannot be rejected"
    );
  }

  if (order.status !== "pending") {
    throw new ConflictError(
      `Only pending orders can be rejected (current status: ${order.status})`
    );
  }

  order.status = "rejected";
  order.rejected_at = new Date();
  order.rejection_reason = req.body.reason;

  if (req.body?.notes !== undefined) {
    order.review_notes = req.body.notes;
  }

  await order.save();

  const serialized = await fetchSerializedOrder(req, String(order._id));

  return SuccessResponse(res, { order: serialized }, 200, "Order rejected successfully");
}

/* -------------------------------------------------------------------------- */
/*                                   Delete                                   */
/* -------------------------------------------------------------------------- */

export async function deleteOrder(req: Request, res: Response) {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFound("Order not found");

  if (order.applied_to_subscription) {
    throw new ConflictError(
      "Cannot delete an order that was already applied to the club subscription"
    );
  }

  // Cleanup the payment proof file from disk
  removeUploadedFile(uploadPathFromUrl(order.payment_proof));

  await order.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Order deleted successfully");
}

/* -------------------------------------------------------------------------- */
/*                                Bulk Delete                                 */
/* -------------------------------------------------------------------------- */

export async function bulkDeleteOrders(req: Request, res: Response) {
  const ids: string[] = req.body.ids;

  const appliedCount = await Order.countDocuments({
    _id: { $in: ids },
    applied_to_subscription: true,
  });

  if (appliedCount > 0) {
    throw new ConflictError(
      `Cannot delete: ${appliedCount} order(s) were already applied to club subscriptions`
    );
  }

  // Grab proofs before deletion
  const orders = await Order.find({ _id: { $in: ids } })
    .select("payment_proof")
    .lean();

  const result = await Order.deleteMany({ _id: { $in: ids } });

  for (const o of orders) {
    removeUploadedFile(uploadPathFromUrl(o.payment_proof));
  }

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} order(s) deleted successfully`
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Invoice                                   */
/* -------------------------------------------------------------------------- */

export async function getOrderInvoice(req: Request, res: Response) {
  const invoice = await buildInvoiceData(String(req.params.id));

  if (req.query.format === "html") {
    const html = renderInvoiceHtml(invoice);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  }

  return SuccessResponse(res, { invoice });
}

export async function getOrderInvoiceHtml(req: Request, res: Response) {
  const invoice = await buildInvoiceData(String(req.params.id));
  const html = renderInvoiceHtml(invoice);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}