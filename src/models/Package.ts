import { Schema, model, type Model, type Types } from "mongoose";
import type { DiscountType } from "../utils/pricing";

export interface IPackageCycle {
  _id?: Types.ObjectId;
  name: string;
  /** Whether `discount` is a percentage (0-100) or an absolute money amount. */
  discount_type: DiscountType;
  /** Discount value, interpreted according to `discount_type`. */
  discount: number;
  /** Full price before discount. */
  price: number;
  /** Cycle length in months. */
  months: number;
}

export interface IPackage {
  name: string;
  status: boolean;
  game_id: Types.ObjectId;
  /** Maximum number of teams allowed by this package. */
  teams: number;
  /** Maximum number of players per team allowed by this package. */
  players: number;
  cycles: IPackageCycle[];
  createdAt: Date;
  updatedAt: Date;
}

type PackageModel = Model<IPackage>;

const cycleSchema = new Schema<IPackageCycle>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    discount_type: {
      type: String,
      enum: ["percentage", "amount"],
      default: "percentage",
      required: true,
    },
    discount: { type: Number, default: 0, min: 0 },
    price: { type: Number, required: true, min: 0 },
    months: { type: Number, required: true, min: 1, max: 120 },
  },
  { _id: true, versionKey: false }
);

const packageSchema = new Schema<IPackage, PackageModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: Boolean, default: true, required: true },
    game_id: {
      type: Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      index: true,
    },
    teams: { type: Number, default: 0, min: 0 },
    players: { type: Number, default: 0, min: 0 },
    cycles: {
      type: [cycleSchema],
      default: [],
      validate: {
        validator: (cycles: IPackageCycle[]) => cycles.length > 0,
        message: "At least one cycle is required",
      },
    },
  },
  { timestamps: true, versionKey: false }
);

packageSchema.index({ game_id: 1, name: 1 }, { unique: true });
packageSchema.index({ status: 1 });

// Model-level safety net (the API layer validates this earlier with Zod).
packageSchema.pre("validate", function validateCycleDiscounts(next) {
  this.cycles.forEach((cycle, index) => {
    if (cycle.discount_type === "amount" && cycle.discount > cycle.price) {
      this.invalidate(
        `cycles.${index}.discount`,
        "Discount amount cannot be greater than the cycle price"
      );
    }
  });

  next();
});

export const Package = model<IPackage, PackageModel>("Package", packageSchema);
