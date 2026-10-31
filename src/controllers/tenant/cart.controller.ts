import type { FilterQuery } from "mongoose";
import type { Request, Response } from "express";
import { Order, type IOrder } from "../../models/Order";
import { Package } from "../../models/Package";
import { PaymentMethod } from "../../models/PaymentMethod";
import { getOrCreateSettings } from "../../models/Settings";
import { evaluateSubscription } from "../../services/subscription.service";
import { BadRequest, ConflictError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { buildListQuery } from "../../utils/listQuery";
import { buildPaginationMeta } from "../../utils/pagination";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import { getUploadedImage, publicUploadUrl, removeUploadedFile } from "../../config/upload";
import type { ICart } from "../../models/tenant";
import { resolveCartPricing } from "../../services/tenantCart.service";
import { filterById } from "./helpers";

const SORT_FIELDS = ["createdAt", "updatedAt", "final_price", "months"];

/** `GET /api/tenant/cart` (collection: `order-cart`) */
export async function listCart(req: Request, res: Response) {
  const models = tenantModels(req);

  const { filter, page, limit, skip, sort } = buildListQuery(req, {
    sortFields: SORT_FIELDS,
    defaultSort: "createdAt",
    defaultOrder: -1,
  });

  const status = req.query.status;
  if (typeof status === "string" && status.trim()) filter.status = status.trim();

  const [items, total] = await Promise.all([
    models.Cart.find(filter as FilterQuery<ICart>)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    models.Cart.countDocuments(filter as FilterQuery<ICart>),
  ]);

  const packageIds = [...new Set(items.map((item) => String(item.package_id)))];
  const packages = await Package.find({ _id: { $in: packageIds } })
    .select("name game_id teams players")
    .lean();
  const packageById = new Map(packages.map((pkg) => [String(pkg._id), pkg]));

  const enriched = items.map((item) => ({
    ...item,
    package: packageById.get(String(item.package_id)) ?? null,
  }));

  return SuccessResponse(res, {
    items: enriched,
    pagination: buildPaginationMeta(total, page, limit),
  });
}

/** `GET /api/tenant/cart/:id` */
export async function getCartItem(req: Request, res: Response) {
  const models = tenantModels(req);

  const cart = await models.Cart.findById(req.params.id).lean();
  if (!cart) throw new NotFound("Cart item not found");

  const pkg = await Package.findById(cart.package_id).lean();
  const order = cart.order_id ? await Order.findById(cart.order_id).lean() : null;

  return SuccessResponse(res, { cart, package: pkg, order });
}

/** `POST /api/tenant/cart` */
export async function createCartItem(req: Request, res: Response) {
  const models = tenantModels(req);

  const pricing = await resolveCartPricing(req.body.package_id, req.body.cycle_id);

  const cart = await models.Cart.create({
    package_id: pricing.package._id,
    cycle_id: pricing.cycle._id ?? null,
    cycle_name: pricing.cycle_name,
    months: pricing.months,
    price: pricing.price,
    discount: pricing.discount,
    discount_type: pricing.discount_type,
    notes: req.body.notes ?? null,
    status: "cart",
  });

  return SuccessResponse(res, { cart }, 201, "Cart item created successfully");
}

/** `PUT|PATCH /api/tenant/cart/:id` */
export async function updateCartItem(req: Request, res: Response) {
  const models = tenantModels(req);

  const cart = await models.Cart.findById(req.params.id);
  if (!cart) throw new NotFound("Cart item not found");

  if (cart.status !== "cart") {
    throw new ConflictError(`This cart item is already ${cart.status} and cannot be edited`);
  }

  if (req.body.package_id !== undefined || req.body.cycle_id !== undefined) {
    const pricing = await resolveCartPricing(
      req.body.package_id ?? String(cart.package_id),
      req.body.cycle_id ?? (cart.cycle_id ? String(cart.cycle_id) : undefined)
    );

    cart.package_id = pricing.package._id;
    cart.cycle_id = pricing.cycle._id ?? null;
    cart.cycle_name = pricing.cycle_name;
    cart.months = pricing.months;
    cart.price = pricing.price;
    cart.discount = pricing.discount;
    cart.discount_type = pricing.discount_type;
  }

  if (req.body.notes !== undefined) cart.notes = req.body.notes;

  await cart.save();

  return SuccessResponse(res, { cart }, 200, "Cart item updated successfully");
}

/** `DELETE /api/tenant/cart/:id` */
export async function deleteCartItem(req: Request, res: Response) {
  const models = tenantModels(req);

  const cart = await models.Cart.findById(req.params.id);
  if (!cart) throw new NotFound("Cart item not found");

  if (cart.status === "checked_out") {
    throw new ConflictError("This cart item was already checked out and cannot be deleted");
  }

  await cart.deleteOne();

  return SuccessResponse(res, { id: req.params.id }, 200, "Cart item deleted successfully");
}

/** `POST /api/tenant/cart/bulk-delete` */
export async function bulkDeleteCart(req: Request, res: Response) {
  const models = tenantModels(req);
  const ids: string[] = req.body.ids;

  const checkedOut = await models.Cart.countDocuments({
    _id: { $in: ids },
    status: "checked_out",
  });

  if (checkedOut > 0) {
    throw new ConflictError(
      `Cannot delete: ${checkedOut} cart item(s) were already checked out`
    );
  }

  const result = await models.Cart.deleteMany({ _id: { $in: ids } });

  return SuccessResponse(
    res,
    { deletedCount: result.deletedCount },
    200,
    `${result.deletedCount} cart item(s) deleted successfully`
  );
}

/**
 * `POST /api/tenant/cart/checkout`
 * Checks out **every** item currently in the cart (status `cart`):
 * creates one central `Order` per item (status `pending`) that the super admin
 * reviews, then removes those items from the cart.
 * The subscription is extended only after the super admin approves the orders.
 */
export async function checkoutCart(req: Request, res: Response) {
  const models = tenantModels(req);
  const { club } = tenantContext(req);

  const items = await models.Cart.find({ status: "cart" }).sort({ createdAt: 1 });
  if (!items.length) {
    throw new BadRequest("Your cart is empty");
  }

  const paymentMethod = await PaymentMethod.findById(req.body.payment_method_id).lean();
  if (!paymentMethod) throw new NotFound("Payment method not found");
  if (!paymentMethod.status) throw new BadRequest("This payment method is not available");

  const file = getUploadedImage(req);
  const uploadedProofUrl = file ? publicUploadUrl(file.filename) : null;
  const finalProof = uploadedProofUrl ?? req.body.payment_proof ?? null;

  if (!finalProof) {
    throw new BadRequest("Payment proof is required (upload a file or provide an image URL)");
  }

  const settings = await getOrCreateSettings();
  const subscription = evaluateSubscription(club, settings.allowed_days);
  // The late-renewal fine is charged once per checkout, not once per cart item.
  const fine = subscription.is_late_renewal ? settings.fines : 0;

  const paymentReference = req.body.payment_reference ?? null;
  const notes = req.body.notes ?? null;

  const created: IOrder[] = [];
  try {
    for (const [index, item] of items.entries()) {
      const order = await Order.create({
        club_id: club._id,
        package_id: item.package_id,
        cycle_id: item.cycle_id ?? null,
        cycle_name: item.cycle_name,
        payment_method_id: paymentMethod._id,
        price: item.price,
        discount: item.discount,
        fine: index === 0 ? fine : 0,
        status: "pending",
        payment_proof: finalProof,
        payment_reference: paymentReference,
        notes: notes ?? item.notes ?? null,
      });
      created.push(order);
    }
  } catch (error) {
    // Roll back the orders created so far; the proof file is shared by all of them.
    if (created.length) {
      await Order.deleteMany({ _id: { $in: created.map((order) => order._id) } });
    }
    if (file) removeUploadedFile(file.path);
    throw error;
  }

  await models.Cart.deleteMany({ _id: { $in: items.map((item) => item._id) } });

  const total = created.reduce(
    (sum, order) => sum + (order.final_price ?? order.price - order.discount + order.fine),
    0
  );

  return SuccessResponse(
    res,
    {
      orders: created,
      count: created.length,
      total,
      payment_proof: finalProof,
    },
    201,
    "Order created and sent to the super admin for review"
  );
}
