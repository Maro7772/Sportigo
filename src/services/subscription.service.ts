import type { Types } from "mongoose";
import { Club, type IClub } from "../models/Club";
import { Order } from "../models/Order";
import { Package, type IPackageCycle } from "../models/Package";

export type SubscriptionState =
  | "active"
  | "inactive"
  | "pending"
  | "grace"
  | "expired";

export interface SubscriptionInfo {
  status: SubscriptionState;
  /** Days remaining until `end_date` (null = no end date). */
  days_left: number | null;
  /** Days remaining in the grace period (null when not in grace). */
  grace_days_left: number | null;
  /** True when the renewal is happening after `end_date`. */
  is_late_renewal: boolean;
  /** Configured grace period used for this calculation. */
  allowed_days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Adds months to a date without the "Jan 31 + 1 month = Mar 3" overflow.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();

  result.setDate(1);
  result.setMonth(result.getMonth() + months);

  const lastDayOfMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();
  result.setDate(Math.min(day, lastDayOfMonth));

  return result;
}

/**
 * Computes the club subscription state.
 *
 * - inactive : club disabled by the super admin
 * - pending  : start_date is in the future
 * - active   : inside the paid period
 * - grace    : end_date passed but still inside `allowed_days`
 * - expired  : end_date + allowed_days passed
 */
export function evaluateSubscription(
  club: Pick<IClub, "status" | "start_date" | "end_date">,
  allowedDays = 0,
  now: Date = new Date(),
): SubscriptionInfo {
  const base = {
    days_left: null as number | null,
    grace_days_left: null as number | null,
    is_late_renewal: false,
    allowed_days: allowedDays,
  };

  if (!club.status) {
    return { ...base, status: "inactive" };
  }

  if (club.start_date && now < club.start_date) {
    return { ...base, status: "pending" };
  }

  if (!club.end_date) {
    return { ...base, status: "active" };
  }

  const endDate = new Date(club.end_date);

  if (now <= endDate) {
    return {
      ...base,
      status: "active",
      days_left: Math.ceil((endDate.getTime() - now.getTime()) / DAY_MS),
    };
  }

  const graceEndsAt = new Date(endDate.getTime() + allowedDays * DAY_MS);

  if (now <= graceEndsAt) {
    return {
      ...base,
      status: "grace",
      days_left: 0,
      grace_days_left: Math.ceil(
        (graceEndsAt.getTime() - now.getTime()) / DAY_MS,
      ),
      is_late_renewal: true,
    };
  }

  return {
    ...base,
    status: "expired",
    days_left: 0,
    grace_days_left: 0,
    is_late_renewal: true,
  };
}

export interface ApplyOrderResult {
  applied: boolean;
  reason?: string;
}

function findCycle(
  pkg: { cycles: IPackageCycle[] },
  cycleId?: Types.ObjectId | null,
) {
  if (!cycleId) return undefined;
  return pkg.cycles.find((cycle) => String(cycle._id) === String(cycleId));
}

/** Rolls back the atomic "applied" lock so the order can be retried. */
async function releaseLock(orderId: unknown) {
  await Order.updateOne(
    { _id: orderId },
    { $set: { applied_to_subscription: false, applied_at: null } },
  );
}

/**
 * Applies a paid order to its club subscription exactly once.
 *
 * - New orders: extends `end_date` by the sum of every item's `months`.
 * - Legacy orders (no `items`): extends by the single package cycle's months.
 *
 * Everything is validated before the club is touched, so an order is applied
 * completely or not at all.
 */
export async function applyPaidOrder(
  orderId: string,
): Promise<ApplyOrderResult> {
  // Atomic lock: only one call can flip the flag.
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: "paid", applied_to_subscription: false },
    { $set: { applied_to_subscription: true, applied_at: new Date() } },
    { new: true },
  );

  if (!order) {
    return {
      applied: false,
      reason: "Order is not paid or was already applied",
    };
  }

  try {
    const club = await Club.findById(order.club_id);
    if (!club) {
      await releaseLock(order._id);
      return { applied: false, reason: "Club not found" };
    }

    const now = new Date();

    if (order.items?.length) {
      // New shape: each item extends its own package subscription's endDate.
      const packageIds = order.items.map((item) => item.package_id);
      const existing = await Package.find({ _id: { $in: packageIds } })
        .select("_id")
        .lean();
      const existingIds = new Set(existing.map((pkg) => String(pkg._id)));

      for (const item of order.items) {
        if (!existingIds.has(String(item.package_id))) {
          await releaseLock(order._id);
          return {
            applied: false,
            reason: "Order has an item with a missing package",
          };
        }
        if (!item.months || item.months < 1) {
          await releaseLock(order._id);
          return {
            applied: false,
            reason: "Order has an item with invalid months",
          };
        }

        // Find or create the subscription for this package.
        if (!club.subscriptions) club.subscriptions = [];
        let sub: any = club.subscriptions.find(
          (s) => String(s.package_id) === String(item.package_id),
        );
        if (!sub) {
          sub = { package_id: item.package_id, cycle_id: item.cycle_id ?? null, start_date: now, end_date: null } as any;
          club.subscriptions.push(sub as any);
        }
        sub = sub as any;
        const base =
          sub.end_date && new Date(sub.end_date) > now
            ? new Date(sub.end_date)
            : now;
        sub.end_date = addMonths(base, item.months);
        if (!sub.start_date || new Date(sub.start_date) > now)
          sub.start_date = now;
        if (item.cycle_id) sub.cycle_id = item.cycle_id;
      }
    } else {
      // Legacy shape: single package + cycle on the order itself.
      const pkg = order.package_id
        ? await Package.findById(order.package_id)
        : null;
      const cycle = pkg ? findCycle(pkg, order.cycle_id) : undefined;

      if (!pkg || !cycle) {
        await releaseLock(order._id);
        return { applied: false, reason: "Order has no valid package cycle" };
      }

      if (!club.subscriptions) club.subscriptions = [];
      let sub: any = club.subscriptions.find(
        (s) => String(s.package_id) === String(order.package_id),
      );
      if (!sub) {
        sub = { package_id: order.package_id, cycle_id: order.cycle_id ?? null, start_date: now, end_date: null } as any;
        club.subscriptions.push(sub);
      }
      const base =
        sub.end_date && new Date(sub.end_date) > now
          ? new Date(sub.end_date)
          : now;
      sub.end_date = addMonths(base, cycle.months);
      if (!sub.start_date || new Date(sub.start_date) > now)
        sub.start_date = now;
      if (order.cycle_id) sub.cycle_id = order.cycle_id;

      // Keep legacy fields in sync for the primary/first package.
      club.package_id = order.package_id ?? null;
      club.cycle_id = order.cycle_id ?? null;
      club.start_date = club.start_date && club.start_date <= now ? club.start_date : now;
      club.end_date = sub.end_date;
    }

    // Keep legacy primary fields pointing at the last applied package for compat.
    if (order.items?.length) {
      const last = order.items[order.items.length - 1];
      club.package_id = last.package_id;
    }
    if (!club.start_date || new Date(club.start_date) > now) club.start_date = now;

    await club.save();

    return { applied: true };
  } catch (error) {
    await releaseLock(order._id);
    throw error;
  }
}
