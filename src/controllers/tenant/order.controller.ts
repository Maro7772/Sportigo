import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Order, type IOrder } from "../../models/Order";
import { PaymentMethod } from "../../models/PaymentMethod";
import { getOrCreateSettings } from "../../models/Settings";
import { BadRequest, ForbiddenError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import { resolveCartPricing } from "../../services/tenantCart.service";
import { evaluateSubscription } from "../../services/subscription.service";
import { buildInvoiceData, renderInvoiceHtml } from "../../services/invoice.service";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
  uploadPathFromUrl,
} from "../../config/upload";

const SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "final_price",
  "price",
  "order_number",
  "status",
];

const ORDER_POPULATE = [
  { path: "package_id", select: "name game_id teams players cycles" },
  { path: "payment_method_id", select: "name description status" },
];

function absoluteUrl(req: Request, url: string): string {
  return `${req.protocol}://${req.get("host")}${url}`;
}

/**
 * `GET /api/tenant/orders`
 * Lists all orders placed by this club.
 */
export async function listTenantOrders(req: Request, res: Response) {
  const { club } = tenantContext(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    searchFields: ["order_number", "payment_reference", "notes"],
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  filter.club_id = club._id;

  if (typeof req.query.status === "string" && req.query.status.trim()) {
    filter.status = req.query.status.trim();
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
    items,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/**
 * `GET /api/tenant/orders/:id`
 * Gets a single order belonging to this club.
 */
export async function getTenantOrder(req: Request, res: Response) {
  const { club } = tenantContext(req);

  const order = await Order.findById(req.params.id)
    .populate(ORDER_POPULATE)
    .lean();

  if (!order) {
    throw new NotFound("Order not found");
  }

  if (String(order.club_id) !== String(club._id)) {
    throw new ForbiddenError("This order belongs to another club");
  }

  return SuccessResponse(res, { order });
}

/**
 * `POST /api/tenant/orders`
 * Direct package purchase endpoint.
 * Validates package, cycle and payment method, resolves verified pricing,
 * creates a pending central order, and mirrors it into the club's cart collection.
 */
export async function purchasePackageDirectly(req: Request, res: Response) {
  const { club } = tenantContext(req);
  const models = tenantModels(req);

  const { package_id, cycle_id, payment_method_id, payment_reference, notes, payment_proof: proofUrl } = req.body;

  const [pricing, paymentMethod, settings] = await Promise.all([
    resolveCartPricing(package_id, cycle_id),
    PaymentMethod.findById(payment_method_id).lean(),
    getOrCreateSettings(),
  ]);

  if (!paymentMethod) throw new NotFound("Payment method not found");
  if (!paymentMethod.status) throw new BadRequest("This payment method is not currently available");

  // Determine late renewal fine
  const subscription = evaluateSubscription(club, settings.allowed_days);
  const fine = subscription.is_late_renewal ? settings.fines : 0;

  // Resolve payment proof: uploaded file takes precedence over a URL in the body.
  const file = getUploadedImage(req);
  const uploadedProofUrl = file ? publicUploadUrl(file.filename) : null;
  const finalProof = uploadedProofUrl ?? proofUrl ?? null;

  if (!file && !proofUrl) {
    throw new BadRequest("Payment proof is required (upload a file or provide an image URL)");
  }

  let order: any;
  try {
    // 1. Create central order
    order = await Order.create({
      club_id: club._id,
      package_id: pricing.package._id,
      cycle_id: pricing.cycle._id ?? null,
      payment_method_id: paymentMethod._id,
      price: pricing.price,
      discount: pricing.discount,
      fine,
      status: "pending",
      payment_proof: finalProof,
      payment_reference: payment_reference ?? null,
      notes: notes ?? null,
    });
  } catch (error) {
    if (file) removeUploadedFile(file.path);
    throw error;
  }

  // 2. Synchronize to tenant DB cart collection as checked out
  const cart = await models.Cart.create({
    package_id: pricing.package._id,
    cycle_id: pricing.cycle._id ?? null,
    cycle_name: pricing.cycle_name,
    months: pricing.months,
    price: pricing.price,
    discount: pricing.discount,
    discount_type: pricing.discount_type,
    notes: notes ?? null,
    status: "checked_out",
    order_id: order._id,
  });

  const freshOrder = await Order.findById(order._id)
    .populate(ORDER_POPULATE)
    .lean();

  return SuccessResponse(
    res,
    {
      order: freshOrder,
      cart,
    },
    201,
    "Package purchased successfully. Your order is pending super admin approval."
  );
}

/**
 * `POST /api/tenant/orders/:id/payment-proof` (multipart/form-data, field: `image`)
 * Uploads or replaces the payment receipt screenshot directly on an order.
 */
export async function uploadTenantOrderPaymentProof(req: Request, res: Response) {
  const { club } = tenantContext(req);

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

  if (String(order.club_id) !== String(club._id)) {
    removeUploadedFile(file.path);
    throw new ForbiddenError("This order belongs to another club");
  }

  const previousProof = order.payment_proof;
  const url = publicUploadUrl(file.filename);

  order.payment_proof = url;
  await order.save();

  if (previousProof) {
    removeUploadedFile(uploadPathFromUrl(previousProof));
  }

  const populated = await Order.findById(order._id)
    .populate(ORDER_POPULATE)
    .lean();

  return SuccessResponse(
    res,
    {
      order: populated,
      payment_proof_url: absoluteUrl(req, url),
    },
    200,
    "Payment proof uploaded successfully"
  );
}

/**
 * `GET /api/tenant/orders/:id/invoice`
 * Returns the invoice for the order. Supports `?format=html` to render printable HTML.
 */
export async function getTenantOrderInvoice(req: Request, res: Response) {
  const { club } = tenantContext(req);

  const invoice = await buildInvoiceData(String(req.params.id), String(club._id));

  const format = req.query.format;
  if (format === "html") {
    const html = renderInvoiceHtml(invoice);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  }

  return SuccessResponse(res, { invoice });
}

/**
 * `GET /api/tenant/orders/:id/invoice/html`
 * Renders the HTML invoice directly.
 */
export async function getTenantOrderInvoiceHtml(req: Request, res: Response) {
  const { club } = tenantContext(req);

  const invoice = await buildInvoiceData(String(req.params.id), String(club._id));
  const html = renderInvoiceHtml(invoice);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
