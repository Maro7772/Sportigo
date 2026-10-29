import { Schema, type Connection, type Model, type Types } from "mongoose";
import { roundMoney } from "../../utils/helpers";
import type { DiscountType } from "../../utils/pricing";

export type CartStatus = "cart" | "checked_out" | "cancelled";

/**
 * Tenant collection: `order-cart`
 * A subscription the club is preparing for itself: the chosen central package
 * cycle (duration) plus the price snapshot. Checking it out creates a central
 * `Order` that the super admin reviews.
 */
export interface ICart {
  /** Central `Package` id. */
  package_id: Types.ObjectId;
  /** Central package cycle (duration) id. */
  cycle_id?: Types.ObjectId | null;
  /** Snapshot of the cycle name, e.g. "Quarterly". */
  cycle_name: string;
  /** Duration in months. */
  months: number;
  /** Full price before discount. */
  price: number;
  /** Absolute discount amount (money). */
  discount: number;
  /** How `discount` was calculated. */
  discount_type: DiscountType;
  /** Computed: price - discount (never below 0). */
  final_price: number;
  status: CartStatus;
  /** Central `Order` created when the cart was checked out. */
  order_id?: Types.ObjectId | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const cartSchema = new Schema<ICart>(
  {
    package_id: { type: Schema.Types.ObjectId, required: true, index: true },
    cycle_id: { type: Schema.Types.ObjectId, default: null },
    cycle_name: { type: String, required: true, trim: true, maxlength: 100 },
    months: { type: Number, required: true, min: 1, max: 120 },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    discount_type: {
      type: String,
      enum: ["percentage", "amount"],
      default: "percentage",
      required: true,
    },
    final_price: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["cart", "checked_out", "cancelled"],
      default: "cart",
      required: true,
      index: true,
    },
    order_id: { type: Schema.Types.ObjectId, default: null },
    notes: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false, collection: "order-cart" }
);

cartSchema.pre("validate", function calculateFinalPrice(next) {
  this.final_price = roundMoney(Math.max(0, this.price - this.discount));
  next();
});

export function cartModel(connection: Connection): Model<ICart> {
  return (
    (connection.models.Cart as Model<ICart>) ??
    connection.model<ICart>("Cart", cartSchema)
  );
}
