/**
 * Tenant order views.
 *
 * An order stores a snapshot of the chosen cycle (`cycle_id` + `cycle_name`) and
 * its `package_id` is populated with the package (including all of its cycles).
 * `attachCycle` adds the exact cycle that was bought, so clients do not have to
 * search `package.cycles` themselves.
 */
export interface CycleLike {
  _id?: unknown;
  name?: string;
  months?: number;
  price?: number;
  discount?: number;
  discount_type?: string;
}

interface OrderLike {
  cycle_id?: unknown;
  cycle_name?: string | null;
  package_id?: unknown;
}

export function attachCycle<T extends OrderLike>(
  order: T,
): T & { cycle?: CycleLike } {
  const pkg = order.package_id as { cycles?: CycleLike[] } | null | undefined;

  const cycle =
    pkg?.cycles?.find(
      (cycle) => String(cycle._id) === String(order.cycle_id),
    ) ?? null;

  if (!cycle) {
    return order;
  }

  return {
    ...order,
    cycle,
  };
}
