import bcrypt from "bcryptjs";
import { Schema, type Connection, type Model } from "mongoose";

export type TenantRole = "admin" | "coach" | "viewer";

/**
 * Tenant collection: `admin`
 * A club staff account. Every club has its own `admin` collection inside its
 * own database, exactly like the reference project (`admin` table per schema).
 */
export interface ITenantAdmin {
  name: string;
  email: string;
  phone?: string | null;
  /** Hashed password - never returned by default (`select: false`). */
  password: string;
  role: TenantRole;
  status: boolean;
  last_login_at?: Date | null;
  /**
   * Incremented on every password change. Tokens carry the value they were
   * issued with, so a reset/change revokes every older session immediately.
   */
  password_version?: number;
  /** When the password last changed (informational). */
  password_changed_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITenantAdminMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type TenantAdminModel = Model<ITenantAdmin, Record<string, never>, ITenantAdminMethods>;
export type { TenantAdminModel };

export const tenantAdminSchema = new Schema<
  ITenantAdmin,
  TenantAdminModel,
  ITenantAdminMethods
>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 190,
    },
    phone: { type: String, trim: true, maxlength: 30 },
    password: { type: String, required: true, minlength: 6, select: false },
    role: {
      type: String,
      enum: ["admin", "coach", "viewer"],
      default: "coach",
      required: true,
      index: true,
    },
    status: { type: Boolean, default: true, required: true },
    last_login_at: { type: Date, default: null },
    password_version: { type: Number, default: 0, required: true },
    password_changed_at: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false, collection: "admin" }
);

// A phone number is optional, but when present it must be unique inside the club.
tenantAdminSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);

tenantAdminSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();

  try {
    this.password = await bcrypt.hash(this.password, 10);

    // A password change invalidates every token issued before it.
    // (Skipped on creation: there is nothing to revoke yet.)
    if (!this.isNew) {
      this.password_version = (this.password_version ?? 0) + 1;
      this.password_changed_at = new Date();
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

tenantAdminSchema.methods.comparePassword = function comparePassword(
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

tenantAdminSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    delete ret.password;
    return ret;
  },
});

export function tenantAdminModel(connection: Connection): TenantAdminModel {
  return (
    (connection.models.TenantAdmin as TenantAdminModel) ??
    connection.model<ITenantAdmin, TenantAdminModel>("TenantAdmin", tenantAdminSchema)
  );
}
