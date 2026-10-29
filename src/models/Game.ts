import { Schema, model, type Model, type Types } from "mongoose";

export interface IGame {
  name: string;
  status: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type GameModel = Model<IGame>;

const gameSchema = new Schema<IGame, GameModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    status: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false }
);

gameSchema.index({ name: 1 }, { unique: true });
gameSchema.index({ status: 1 });

export const Game = model<IGame, GameModel>("Game", gameSchema);

export type GameId = Types.ObjectId;
