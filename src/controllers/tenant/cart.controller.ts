import type { Request, Response } from "express";
import { Order, type IOrder } from "../../models/Order";
import { Package } from "../../models/Package";
import { PaymentMethod } from "../../models/PaymentMethod";
import { getOrCreateSettings } from "../../models/Settings";
import { evaluateSubscription } from "../../services/subscription.service";
import { BadRequest, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import { getUploadedImage, publicUploadUrl, removeUploadedFile } from "../../config/upload";
import { resolveCartPricing } from "../../services/tenantCart.service";

/**
 * Each club owns exactly **one cart** (inside its own tenant database), so the
 * cart endpoints never take an item id: they always read/write the single
 * document with `status: "cart"`.
 */

/** `GET /api/tenant/cart` (collection: `order-cart`) */
export async function getCart(req: Request, res: Response) {
  const models = tenantModels(req);

  const cart = await models.Cart.findOne({ status: "cart" })
    .sort({ createdAt: -1 })
    .lean();

  const pkg = cart
    ? await Package.findById(cart.package_id)
        .select("name game_id teams players cycles")
        .lean()
    : null;

  return SuccessResponse(res, { cart: cart ?? null, package: pkg });
}

/**
 * `POST /api/tenant/cart`
 * Adds the selected package/cycle to the club's cart. Because a club has a
 * single cart, a second POST updates the existing one instead of adding a row.
 */
export async function saveCartItem(req: Request, res: Response) {
  const models = tenantModels(req);

  const pricing = await resolveCartPricing(req.body.package_id, req.body.cycle_id);

  const existing = await models.Cart.findOne({ status: "cart" });

  if (existing) {
    existing.package_id = pricing.package._id;
    existing.cycle_id = pricing.cycle._id ?? null;
    existing.cycle_name = pricing.cycle_name;
    existing.months = pricing.months;
    existing.price = pricing.price;
    existing.discount = pricing.discount;
    existing.discount_type = pricing.discount_type;
    if (req.body.notes !== undefined) existing.notes = req.body.notes;

    await existing.save();

    return SuccessResponse(res, { cart: existing }, 200, "Cart item updated successfully");
  }

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

/** `PUT|PATCH /api/tenant/cart` */
export async function updateCartItem(req: Request, res: Response) {
  const models = tenantModels(req);

  const cart = await models.Cart.findOne({ status: "cart" });
  if (!cart) throw new NotFound("Your cart is empty");

  const packageChanged =
    req.body.package_id !== undefined &&
    String(req.body.package_id) !== String(cart.package_id);

  if (req.body.package_id !== undefined || req.body.cycle_id !== undefined) {
    const packageId = req.body.package_id ?? String(cart.package_id);
    const cycleId =
      req.body.cycle_id !== undefined
        ? req.body.cycle_id
        : packageChanged
          ? undefined
          : cart.cycle_id
            ? String(cart.cycle_id)
            : undefined;

    const pricing = await resolveCartPricing(packageId, cycleId);

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

/** `DELETE /api/tenant/cart` */
export async function clearCart(req: Request, res: Response) {
  const models = tenantModels(req);

  const cart = await models.Cart.findOne({ status: "cart" });
  if (!cart) throw new NotFound("Your cart is empty");

  await cart.deleteOne();

  return SuccessResponse(res, { cleared: true }, 200, "Cart cleared successfully");
}

/**
 * `POST /api/tenant/cart/checkout`
 * Checks out the club's cart: creates one central `Order` (status `pending`)
 * that the super admin reviews, then clears the cart.
 * The subscription is extended only after the super admin approves the order.
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
