import { Schema, model, type Model, type Types } from "mongoose";
import { roundMoney } from "../utils/helpers";
import { nextOrderNumber } from "../services/orderNumber.service";
import type { DiscountType } from "../utils/pricing";

export type OrderStatus =
  | "pending"
  | "paid"
  | "rejected"
  | "cancelled"
  | "refunded";

/** One purchased package line inside an order (snapshot at purchase time). */
export interface IOrderItem {
  _id?: any;
  package_id: Types.ObjectId;
  cycle_id?: Types.ObjectId | null;
  /** Snapshot of the cycle name at purchase time. */
  cycle_name?: string | null;
  /** Duration in months. */
  months: number;
  /** Full price before discount. */
  price: number;
  /** Absolute discount amount (money). */
  discount: number;
  discount_type: DiscountType;
  /** price - discount (never below 0). */
  final_price: number;
  notes?: string | null;
}

export interface IOrder {
  _id: any;
  order_number: string;
  club_id: Types.ObjectId;
  /** All packages purchased in this order. */
  items: IOrderItem[];
  /**
   * @deprecated Legacy single-package orders only. New orders use `items`.
   */
  package_id?: Types.ObjectId | null;
  /** @deprecated Legacy single-package orders only. */
  cycle_id?: Types.ObjectId | null;
  /** @deprecated Legacy single-package orders only. */
  cycle_name?: string | null;
  payment_method_id: Types.ObjectId;
  /** Sum of all items' price. */
  price: number;
  /** Sum of all items' discount. */
  discount: number;
  fine: number;
  final_price: number;
  status: OrderStatus;
  payment_proof?: string | null;
  payment_reference?: string | null;
  paid_at?: Date | null;
  approved_by?: Types.ObjectId | null;
  /** Snapshot of the approver's name (so we can show it without joining). */
  approved_by_name?: string | null;
  approved_at?: Date | null;
  rejected_at?: Date | null;
  rejection_reason?: string | null;
  review_notes?: string | null;
  applied_to_subscription: boolean;
  applied_at?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type OrderModel = Model<IOrder>;

const orderItemSchema = new Schema<IOrderItem>(
  {
    package_id: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    cycle_id: { type: Schema.Types.ObjectId, default: null },
    cycle_name: { type: String, default: null, trim: true, maxlength: 100 },
    months: { type: Number, required: true, min: 1, max: 120 },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    discount_type: {
      type: String,
      enum: ["percentage", "amount"],
      default: "percentage",
    },
    final_price: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { _id: true },
);

const orderSchema = new Schema<IOrder, OrderModel>(
  {
    order_number: { type: String, required: true, unique: true, trim: true },
    club_id: {
      type: Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },
    items: { type: [orderItemSchema], default: [] },
    // Legacy fields: kept (optional) so old single-package orders still load.
    package_id: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      default: null,
      index: true,
    },
    cycle_id: { type: Schema.Types.ObjectId, default: null },
    cycle_name: { type: String, default: null, trim: true, maxlength: 100 },
    payment_method_id: {
      type: Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true,
      index: true,
    },
    approved_by_name: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
    },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    fine: { type: Number, default: 0, min: 0 },
    final_price: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["pending", "paid", "rejected", "cancelled", "refunded"],
      default: "pending",
      required: true,
      index: true,
    },
    payment_proof: { type: String, default: null, trim: true, maxlength: 2000 },
    payment_reference: {
      type: String,
      default: null,
      trim: true,
      maxlength: 200,
    },
    paid_at: { type: Date, default: null },
    approved_by: {
      type: Schema.Types.ObjectId,
      ref: "SuperAdmin",
      default: null,
    },
    approved_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    rejection_reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    review_notes: { type: String, default: null, trim: true, maxlength: 1000 },
    applied_to_subscription: { type: Boolean, default: false, required: true },
    applied_at: { type: Date, default: null },
    notes: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.pre("validate", async function assignOrderNumber() {
  if (!this.order_number) {
    this.order_number = await nextOrderNumber();
  }
});

orderSchema.pre("validate", function calculateFinalPrice(next) {
  // Per-item final price.
  for (const item of this.items ?? []) {
    item.final_price = roundMoney(Math.max(0, item.price - item.discount));
  }

  // When the order has items, its totals are derived from them.
  if (this.items?.length) {
    this.price = roundMoney(
      this.items.reduce((sum, item) => sum + item.price, 0),
    );
    this.discount = roundMoney(
      this.items.reduce((sum, item) => sum + item.discount, 0),
    );
  }

  this.final_price = roundMoney(
    Math.max(0, this.price - this.discount + this.fine),
  );

  if (this.status === "paid" && !this.paid_at) {
    this.paid_at = new Date();
  }

  next();
});

orderSchema.index({ createdAt: -1 });
orderSchema.index({ club_id: 1, status: 1 });
orderSchema.index({ status: 1, paid_at: -1 });
orderSchema.index({ "items.package_id": 1 });

export const Order = model<IOrder, OrderModel>("Order", orderSchema);
