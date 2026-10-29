import type { Types } from "mongoose";
import { Package, type IPackage, type IPackageCycle } from "../models/Package";
import { BadRequest, NotFound } from "../errors";
import { calculateDiscountAmount, type DiscountType } from "../utils/pricing";

export interface CartPricing {
  package: IPackage & { _id: Types.ObjectId };
  cycle: IPackageCycle;
  cycle_name: string;
  months: number;
  price: number;
  discount: number;
  discount_type: DiscountType;
  final_price: number;
}

/**
 * Resolves the price snapshot of a cart from the central package + cycle.
 * The client never sends prices: they always come from the package definition.
 */
export async function resolveCartPricing(
  packageId: string,
  cycleId?: string | null
): Promise<CartPricing> {
  const pkg = await Package.findById(packageId).lean();
  if (!pkg) throw new NotFound("Package not found");
  if (!pkg.status) throw new BadRequest("This package is not available");

  let cycle: IPackageCycle | undefined;

  if (cycleId) {
    cycle = pkg.cycles.find((item) => String(item._id) === String(cycleId));
    if (!cycle) throw new BadRequest("Cycle not found in this package");
  } else if (pkg.cycles.length === 1) {
    cycle = pkg.cycles[0];
  } else {
    throw new BadRequest("cycle_id is required (this package has multiple durations)");
  }

  const discount = calculateDiscountAmount(cycle.price, cycle.discount, cycle.discount_type);

  return {
    package: pkg,
    cycle,
    cycle_name: cycle.name,
    months: cycle.months,
    price: cycle.price,
    discount,
    discount_type: cycle.discount_type,
    final_price: Math.max(0, cycle.price - discount),
  };
}
