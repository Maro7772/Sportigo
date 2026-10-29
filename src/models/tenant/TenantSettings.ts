import { Schema, type Connection, type Model } from "mongoose";

/**
 * Tenant collection: `settings`
 * Branding of the club's own dashboard. One document per tenant database.
 */
export interface ITenantSettings {
  key: "tenant";
  logo?: string | null;
  /** Gradient / theme background colors, e.g. ["#0f172a", "#1e293b"]. */
  background_color: string[];
  /** Primary UI colors, e.g. ["#16a34a"]. */
  color: string[];
  createdAt: Date;
  updatedAt: Date;
}

export const tenantSettingsSchema = new Schema<ITenantSettings>(
  {
    key: { type: String, enum: ["tenant"], default: "tenant", unique: true, required: true },
    logo: { type: String, default: null, trim: true, maxlength: 2000 },
    background_color: { type: [String], default: [] },
    color: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false, collection: "settings" }
);

export function tenantSettingsModel(connection: Connection): Model<ITenantSettings> {
  return (
    (connection.models.TenantSettings as Model<ITenantSettings>) ??
    connection.model<ITenantSettings>("TenantSettings", tenantSettingsSchema)
  );
}
