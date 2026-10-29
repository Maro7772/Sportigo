import { roundMoney } from "./helpers";

export type DiscountType = "percentage" | "amount";

/**
 * Converts a cycle discount into an absolute money amount.
 * - percentage: price * discount / 100
 * - amount: the discount value itself, capped at the price
 */
export function calculateDiscountAmount(
  price: number,
  discount: number,
  discountType: DiscountType = "percentage"
): number {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(discount) || discount <= 0) {
    return 0;
  }

  if (discountType === "amount") {
    return roundMoney(Math.min(discount, price));
  }

  return roundMoney((price * Math.min(discount, 100)) / 100);
}
