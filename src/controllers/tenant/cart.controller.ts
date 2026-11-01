import type { Request, Response } from "express";
import { Order, type IOrder } from "../../models/Order";
import { Package } from "../../models/Package";
import { PaymentMethod } from "../../models/PaymentMethod";
import { getOrCreateSettings } from "../../models/Settings";
import { evaluateSubscription } from "../../services/subscription.service";
import { BadRequest, ConflictError, NotFound } from "../../errors";
import { SuccessResponse } from "../../utils/response";
import { roundMoney } from "../../utils/helpers";
import { attachCycle } from "../../utils/orderView";
import { tenantContext, tenantModels } from "../../middlewares/tenant";
import type { TenantModels } from "../../models/tenant";
import {
  getUploadedImage,
  publicUploadUrl,
  removeUploadedFile,
} from "../../config/upload";
import {
  resolveCartPricing,
  type CartPricing,
} from "../../services/tenantCart.service";

/**
 * Each club owns **one cart**, but the cart holds **many lines** (one document
 * per added package in the tenant `order-cart` collection with `status: "cart"`).
 *
 * No endpoint takes a cart-line id: `POST` appends a line (a package appears at
 * most once, identified by `package_id`), `PUT` replaces the whole array,
 * `PATCH` updates one line, `DELETE` removes a line or clears the cart, and
 * `GET` returns the current `items`.
 */

interface CartLineInput {
  package_id: string;
  cycle_id?: string | null;
  notes?: string | null;
}

function lineFromPricing(pricing: CartPricing, notes?: string | null) {
  return {
    package_id: pricing.package._id,
    cycle_id: pricing.cycle._id ?? null,
    cycle_name: pricing.cycle_name,
    months: pricing.months,
    price: pricing.price,
    discount: pricing.discount,
    discount_type: pricing.discount_type,
    notes: notes ?? null,
    status: "cart" as const,
  };
}

/** Shapes the whole cart (all `status: "cart"` lines) with their central package. */
async function buildCartPayload(models: TenantModels) {
  const items = await models.Cart.find({ status: "cart" })
    .sort({ createdAt: 1 })
    .lean();

  const packages = await Package.find({
    _id: { $in: items.map((item) => item.package_id) },
  })
    .select("name game_id teams players status")
    .lean();

  const byId = new Map(packages.map((pkg) => [String(pkg._id), pkg]));

  const enriched = items.map((item) => {
    const pkg = byId.get(String(item.package_id)) ?? null;

    return {
      ...item,
      package: pkg,
    };
  });

  return {
    items: enriched,
    count: enriched.length,
    total: roundMoney(
      enriched.reduce((sum, item) => sum + (item.final_price ?? 0), 0),
    ),
  };
}

/** `GET /api/tenant/cart` (collection: `order-cart`, status: `cart`) */
export async function getCart(req: Request, res: Response) {
  return SuccessResponse(res, await buildCartPayload(tenantModels(req)));
}

/**
 * `POST /api/tenant/cart`
 * Appends the selected package/cycle as a new cart line. A package can appear
 * only once in the cart (409), but different packages are added as separate
 * lines, so `GET` returns an array.
 */
export async function saveCartItem(req: Request, res: Response) {
  const models = tenantModels(req);
  const { package_id, cycle_id, notes } = req.body;

  const pricing = await resolveCartPricing(package_id, cycle_id);

  const existing = await models.Cart.findOne({
    status: "cart",
    package_id: pricing.package._id,
  });

  if (existing) {
    throw new ConflictError(
      "This package is already in your cart. Remove it first or update its cycle.",
    );
  }

  await models.Cart.create(lineFromPricing(pricing, notes));

  return SuccessResponse(
    res,
    await buildCartPayload(models),
    201,
    "Cart item added successfully",
  );
}

/**
 * `PUT /api/tenant/cart`
 * Replaces the whole cart with the sent array (the frontend can sync its local
 * cart in one request). An empty array clears the cart.
 */
export async function replaceCart(req: Request, res: Response) {
  const models = tenantModels(req);
  const lines: CartLineInput[] = req.body.items;

  const packageIds = lines.map((line) => String(line.package_id));
  if (new Set(packageIds).size !== packageIds.length) {
    throw new BadRequest("Each package can appear only once in the cart");
  }

  // Price everything first: a bad package/cycle leaves the current cart untouched.
  const priced = await Promise.all(
    lines.map((line) => resolveCartPricing(line.package_id, line.cycle_id)),
  );

  const previous = await models.Cart.find({ status: "cart" })
    .select("_id")
    .lean();

  const created = priced.length
    ? await models.Cart.insertMany(
        priced.map((item, index) => lineFromPricing(item, lines[index].notes)),
      )
    : [];

  // Only drop the previous lines after the new ones are safely stored.
  if (previous.length) {
    await models.Cart.deleteMany({
      _id: { $in: previous.map((line) => line._id) },
    });
  }

  return SuccessResponse(
    res,
    await buildCartPayload(models),
    200,
    `Cart updated successfully (${created.length} item(s))`,
  );
}

/**
 * `PATCH /api/tenant/cart`
 * Updates one line, identified by `package_id` (no cart-line id needed).
 */
export async function updateCartItem(req: Request, res: Response) {
  const models = tenantModels(req);
  const { package_id, cycle_id, notes } = req.body;

  const cart = await models.Cart.findOne({ status: "cart", package_id });
  if (!cart) throw new NotFound("This package is not in your cart");

  if (cycle_id !== undefined) {
    const pricing = await resolveCartPricing(String(package_id), cycle_id);

    cart.cycle_id = pricing.cycle._id ?? null;
    cart.cycle_name = pricing.cycle_name;
    cart.months = pricing.months;
    cart.price = pricing.price;
    cart.discount = pricing.discount;
    cart.discount_type = pricing.discount_type;
  }

  if (notes !== undefined) cart.notes = notes ?? null;

  await cart.save();

  return SuccessResponse(
    res,
    await buildCartPayload(models),
    200,
    "Cart item updated successfully",
  );
}

/**
 * `DELETE /api/tenant/cart?package_id=...`
 * Removes one line (matched by package). Without `package_id` the whole cart is
 * cleared.
 */
export async function clearCart(req: Request, res: Response) {
  const models = tenantModels(req);
  const { package_id } = req.query;

  if (package_id !== undefined) {
    const deleted = await models.Cart.deleteOne({ status: "cart", package_id });

    if (!deleted.deletedCount) {
      throw new NotFound("This package is not in your cart");
    }
  } else {
    await models.Cart.deleteMany({ status: "cart" });
  }

  return SuccessResponse(
    res,
    await buildCartPayload(models),
    200,
    "Cart cleared successfully",
  );
}

/**
 * `POST /api/tenant/cart/checkout`
 * Checks out the whole cart: creates one central `Order` (status `pending`) per
 * line for the super admin to review, then clears the cart.
 * The subscription is extended only after the super admin approves the orders.
 */
export async function checkoutCart(req: Request, res: Response) {
  const models = tenantModels(req);
  const { club } = tenantContext(req);

  const items = await models.Cart.find({ status: "cart" }).sort({
    createdAt: 1,
  });
  if (!items.length) {
    throw new BadRequest("Your cart is empty");
  }

  const paymentMethod = await PaymentMethod.findById(
    req.body.payment_method_id,
  ).lean();
  if (!paymentMethod) throw new NotFound("Payment method not found");
  if (!paymentMethod.status)
    throw new BadRequest("This payment method is not available");

  const file = getUploadedImage(req);
  const uploadedProofUrl = file ? publicUploadUrl(file.filename) : null;
  const finalProof = uploadedProofUrl ?? req.body.payment_proof ?? null;

  if (!finalProof) {
    throw new BadRequest(
      "Payment proof is required (upload a file or provide an image URL)",
    );
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
      await Order.deleteMany({
        _id: { $in: created.map((order) => order._id) },
      });
    }
    if (file) removeUploadedFile(file.path);
    throw error;
  }

  await models.Cart.deleteMany({ _id: { $in: items.map((item) => item._id) } });

  // Return the created orders populated with their package (including all its
  // cycles), payment method, and the exact cycle recorded on each order.
  const orders = (
    await Order.find({ _id: { $in: created.map((order) => order._id) } })
      .populate([
        {
          path: "package_id",
          select: "name game_id teams players status",
        },
        { path: "payment_method_id", select: "name description status" },
      ])
      .sort({ createdAt: 1 })
      .lean()
  ).map(attachCycle);

  const total = orders.reduce(
    (sum, order) =>
      sum + (order.final_price ?? order.price - order.discount + order.fine),
    0,
  );

  return SuccessResponse(
    res,
    {
      orders,
      count: orders.length,
      total,
      payment_proof: finalProof,
    },
    201,
    "Order created and sent to the super admin for review",
  );
}
