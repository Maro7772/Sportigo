/**
 * Tenant order views.
 *
 * New orders store every purchased package in `items`. Each item keeps a
 * snapshot of the chosen cycle (`cycle_id` + `cycle_name`) and its `package_id`
 * is populated with the package (including all of its cycles).
 *
 * `attachCycle` adds the exact cycle that was bought to each item, so clients
 * do not have to search `package.cycles` themselves.
 *
 * Legacy orders (no `items`, single `package_id` / `cycle_id` on the order)
 * keep the old behavior: a top-level `cycle` is attached.
 */
export interface CycleLike {
  _id?: unknown;
  name?: string;
  months?: number;
  price?: number;
  discount?: number;
  discount_type?: string;
}

interface PackageLike {
  cycles?: CycleLike[];
}

interface OrderItemLike {
  cycle_id?: unknown;
  cycle_name?: string | null;
  package_id?: unknown;
}

interface OrderLike {
  items?: OrderItemLike[];
  // Legacy single-package fields
  cycle_id?: unknown;
  cycle_name?: string | null;
  package_id?: unknown;
}

function findCycle(packageRef: unknown, cycleId: unknown): CycleLike | null {
  const pkg = packageRef as PackageLike | null | undefined;

  if (!pkg || !Array.isArray(pkg.cycles) || cycleId == null) {
    return null;
  }

  return (
    pkg.cycles.find((cycle) => String(cycle._id) === String(cycleId)) ?? null
  );
}

export function attachCycle<T extends OrderLike>(order: T): T {
  // New shape: attach `cycle` to every item.
  if (Array.isArray(order.items) && order.items.length > 0) {
    const items = order.items.map((item) => {
      const cycle = findCycle(item.package_id, item.cycle_id);
      return cycle ? { ...item, cycle } : item;
    });

    return { ...order, items };
  }

  // Legacy shape: single package/cycle on the order itself.
  const cycle = findCycle(order.package_id, order.cycle_id);

  if (!cycle) {
    return order;
  }

  return {
    ...order,
    cycle,
  } as T;
}
