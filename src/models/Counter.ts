import { Schema, model, type Model } from "mongoose";

export interface ICounter {
  /** Counter key, e.g. "orders-2026". */
  _id: string;
  seq: number;
}

type CounterModel = Model<ICounter>;

const counterSchema = new Schema<ICounter, CounterModel>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0, required: true },
  },
  { versionKey: false }
);

export const Counter = model<ICounter, CounterModel>("Counter", counterSchema);
