import { Schema, model, type Model } from "mongoose";

export interface IPaymentMethod {
  name: string;
  status: boolean;
  description?: string | null;
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type PaymentMethodModel = Model<IPaymentMethod>;

const paymentMethodSchema = new Schema<IPaymentMethod, PaymentMethodModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100, unique: true },
    status: { type: Boolean, default: true, required: true },
    description: { type: String, default: null, trim: true, maxlength: 1000 },
    icon: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false }
);

paymentMethodSchema.index({ status: 1 });

export const PaymentMethod = model<IPaymentMethod, PaymentMethodModel>(
  "PaymentMethod",
  paymentMethodSchema
);
