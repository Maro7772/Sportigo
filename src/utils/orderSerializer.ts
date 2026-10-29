// src/utils/orderSerializer.ts
import type { Request } from "express";

/**
 * Lean shape returned to the client:
 * - club / package / payment_method => `{ name }` only
 * - cycle => `cycle_name` (string), not `cycle_id`
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

  return {
    _id: order._id,
    order_number: order.order_number,

    club: order.club_id?.name ? { name: order.club_id.name } : null,
    package: order.package_id?.name ? { name: order.package_id.name } : null,
    cycle: order.cycle_name ? { name: order.cycle_name } : null,
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