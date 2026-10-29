import { Schema, model, type Model, type Types } from "mongoose";

export interface IClub {
  name: string;
  status: boolean;
  /** Unique tenant subdomain (e.g. "ahly" -> ahly.example.com) */
  subdomain: string;
  package_id?: Types.ObjectId | null;
  start_date?: Date | null;
  end_date?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ClubModel = Model<IClub>;

const clubSchema = new Schema<IClub, ClubModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    status: { type: Boolean, default: true, required: true },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
      maxlength: 63,
    },
    package_id: {
      type: Schema.Types.ObjectId,
      ref: "Package",
      default: null,
      index: true,
    },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

clubSchema.index({ status: 1 });

export const Club = model<IClub, ClubModel>("Club", clubSchema);
