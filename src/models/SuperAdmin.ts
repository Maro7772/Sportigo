import bcrypt from "bcryptjs";
import { Schema, model, type Model } from "mongoose";

export interface ISuperAdmin {
  name: string;
  email: string;
  /** Hashed password - never returned by default (`select: false`) */
  password: string;
  role: "super_admin";
  status: boolean;
  last_login_at?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISuperAdminMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type SuperAdminModel = Model<ISuperAdmin, Record<string, never>, ISuperAdminMethods>;

const superAdminSchema = new Schema<ISuperAdmin, SuperAdminModel, ISuperAdminMethods>(
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
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ["super_admin"], default: "super_admin", required: true },
    status: { type: Boolean, default: true, required: true },
    last_login_at: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false }
);

superAdminSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();

  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error as Error);
  }
});

superAdminSchema.methods.comparePassword = function comparePassword(
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

superAdminSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    delete ret.password;
    return ret;
  },
});

export const SuperAdmin = model<ISuperAdmin, SuperAdminModel>(
  "SuperAdmin",
  superAdminSchema
);
