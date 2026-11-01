// src/utils/orderSerializer.ts
import type { Request } from "express";

/**
 * Lean shape returned to the client:
 * - club / payment_method => `{ name }` only
 * - items => one entry per purchased package (`package`, `cycle`, months, prices)
 * - package / cycle (top level) => kept for backward compatibility:
 *     legacy orders use their own fields; new orders use the items
 *     (package = names joined, cycle = the cycle only when there's one item)
 * - payment_proof => absolute URL
 * - approved_by => `approved_by_name` (string), not the ObjectId
 * - applied_to_subscription => hidden
 * - order_number is always present; payment_reference is hidden (redundant)
 */
export function serializeOrder(req: Request, order: any) {
  const absoluteUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/uploads/")) {
      return `${req.protocol}://${req.get("host")}${url}`;
    }
    return url;
  };

  const rawItems: any[] = Array.isArray(order.items) ? order.items : [];

  const items = rawItems.map((item) => ({
    _id: item._id,
    package: item.package_id?.name ? { name: item.package_id.name } : null,
    cycle: item.cycle_name ? { name: item.cycle_name } : null,
    months: item.months ?? null,
    price: item.price,
    discount: item.discount,
    discount_type: item.discount_type ?? null,
    final_price: item.final_price,
    notes: item.notes ?? null,
  }));

  let packageField: { name: string } | null;
  let cycleField: { name: string } | null;

  if (rawItems.length) {
    const names = items
      .map((item) => item.package?.name)
      .filter((name): name is string => Boolean(name));

    packageField = names.length ? { name: names.join(", ") } : null;
    cycleField = items.length === 1 ? items[0].cycle : null;
  } else {
    // Legacy single-package order.
    packageField = order.package_id?.name
      ? { name: order.package_id.name }
      : null;
    cycleField = order.cycle_name ? { name: order.cycle_name } : null;
  }

  return {
    _id: order._id,
    order_number: order.order_number,

    club: order.club_id?.name ? { name: order.club_id.name } : null,
    package: packageField,
    cycle: cycleField,
    items,
    payment_method: order.payment_method_id?.name
      ? { name: order.payment_method_id.name }
      : null,

    price: order.price,
    discount: order.discount,
    fine: order.fine,
    final_price: order.final_price,
    status: order.status,

    payment_proof: absoluteUrl(order.payment_proof),

    approved_by: order.approved_by_name ?? null,
    approved_at: order.approved_at ?? null,
    rejected_at: order.rejected_at ?? null,
    rejection_reason: order.rejection_reason ?? null,
    review_notes: order.review_notes ?? null,

    paid_at: order.paid_at ?? null,
    notes: order.notes ?? null,

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
