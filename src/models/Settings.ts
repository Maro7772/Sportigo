import { Schema, model, type Model } from "mongoose";

export interface ISettings {
  key: "global";
  /** Grace period (in days) allowed before a subscription is considered expired. */
  allowed_days: number;
  /** Enable/disable subscription expiry notifications. */
  notification: boolean;
  /** Default fine amount applied to late renewals/orders. */
  fines: number;
  createdAt: Date;
  updatedAt: Date;
}

type SettingsModel = Model<ISettings>;

const settingsSchema = new Schema<ISettings, SettingsModel>(
  {
    key: { type: String, enum: ["global"], default: "global", unique: true, required: true },
    allowed_days: { type: Number, default: 0, min: 0, max: 365 },
    notification: { type: Boolean, default: true },
    fines: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

export const Settings = model<ISettings, SettingsModel>("Settings", settingsSchema);

export async function getOrCreateSettings(): Promise<ISettings> {
  const existing = await Settings.findOne({ key: "global" });
  if (existing) return existing.toObject();
  return (await Settings.create({ key: "global" })).toObject();
}
