import { Schema, model, type Model, type Types } from "mongoose";
import { roundMoney } from "../utils/helpers";
import { nextOrderNumber } from "../services/orderNumber.service";

export type OrderStatus = "pending" | "paid" | "rejected" | "cancelled" | "refunded";

export interface IOrder {
  /** Human-readable reference, e.g. ORD-2026-000123. */
  order_number: string;
  club_id: Types.ObjectId;
  package_id: Types.ObjectId;
  /** Package cycle that was purchased (snapshot values are stored below). */
  cycle_id?: Types.ObjectId | null;
  payment_method_id: Types.ObjectId;
  price: number;
  /** Absolute discount amount (money). */
  discount: number;
  /** Late payment / penalty amount (money). */
  fine: number;
  /** Computed: price - discount + fine (never below 0). */
  final_price: number;
  status: OrderStatus;
  /** Payment screenshot / receipt URL uploaded by the club. */
  payment_proof?: string | null;
  /** Bank transfer / wallet reference sent by the club. */
  payment_reference?: string | null;
  paid_at?: Date | null;
  /** Super admin who approved (or rejected) the payment. */
  approved_by?: Types.ObjectId | null;
  approved_at?: Date | null;
  rejected_at?: Date | null;
  rejection_reason?: string | null;
  /** Notes written by the super admin while reviewing the payment. */
  review_notes?: string | null;
  /** True when this order already extended the club subscription. */
  applied_to_subscription: boolean;
  applied_at?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type OrderModel = Model<IOrder>;

const orderSchema = new Schema<IOrder, OrderModel>(
  {
    order_number: { type: String, required: true, unique: true, trim: true },
    club_id: {
      type: Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },
    package_id: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      required: true,
      index: true,
    },
    cycle_id: { type: Schema.Types.ObjectId, default: null },
    payment_method_id: {
      type: Schema.Types.ObjectId,
      ref: "PaymentMethod",
      required: true,
      index: true,
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
    payment_reference: { type: String, default: null, trim: true, maxlength: 200 },
    paid_at: { type: Date, default: null },
    approved_by: { type: Schema.Types.ObjectId, ref: "SuperAdmin", default: null },
    approved_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    rejection_reason: { type: String, default: null, trim: true, maxlength: 1000 },
    review_notes: { type: String, default: null, trim: true, maxlength: 1000 },
    applied_to_subscription: { type: Boolean, default: false, required: true },
    applied_at: { type: Date, default: null },
    notes: { type: String, default: null, trim: true, maxlength: 1000 },
  },
  { timestamps: true, versionKey: false }
);

orderSchema.pre("validate", async function assignOrderNumber() {
  if (!this.order_number) {
    this.order_number = await nextOrderNumber();
  }
});

orderSchema.pre("validate", function calculateFinalPrice(next) {
  this.final_price = roundMoney(Math.max(0, this.price - this.discount + this.fine));

  if (this.status === "paid" && !this.paid_at) {
    this.paid_at = new Date();
  }

  next();
});

orderSchema.index({ createdAt: -1 });
orderSchema.index({ club_id: 1, status: 1 });
orderSchema.index({ status: 1, paid_at: -1 });

export const Order = model<IOrder, OrderModel>("Order", orderSchema);
