import { Counter } from "../models/Counter";

/**
 * Generates a human-readable, yearly sequential order number.
 * Example: ORD-2026-000123
 *
 * The counter increment is atomic, so two concurrent orders can never get
 * the same number. On the (rare) upsert race MongoDB raises a duplicate key
 * error, which we retry.
 */
export async function nextOrderNumber(now: Date = new Date()): Promise<string> {
  const year = now.getFullYear();
  const key = `orders-${year}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return `ORD-${year}-${String(counter!.seq).padStart(6, "0")}`;
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 11000) throw error;
    }
  }

  throw new Error("Failed to generate an order number");
}
