import { Schema, model, type Model, type Types } from "mongoose";

export interface IAction {
  game_id: Types.ObjectId;
  name: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type ActionModel = Model<IAction>;

const actionSchema = new Schema<IAction, ActionModel>(
  {
    game_id: {
      type: Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false }
);

// An action name is unique inside its game, but may exist in another game.
actionSchema.index({ game_id: 1, name: 1 }, { unique: true });
actionSchema.index({ status: 1 });

export const Action = model<IAction, ActionModel>("Action", actionSchema);
