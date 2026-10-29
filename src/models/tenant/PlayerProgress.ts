import { Schema, type Connection, type Model, type Types } from "mongoose";

/**
 * Tenant collection: `player-progress`
 * One row = one action performed by a player in a match.
 * `action_id` points to a central `Action` and `match_id` / `player_id` are
 * tenant documents.
 */
export interface IPlayerProgress {
  match_id: Types.ObjectId;
  action_id: Types.ObjectId;
  player_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const playerProgressSchema = new Schema<IPlayerProgress>(
  {
    match_id: { type: Schema.Types.ObjectId, required: true, index: true },
    action_id: { type: Schema.Types.ObjectId, required: true, index: true },
    player_id: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true, versionKey: false, collection: "player-progress" }
);

playerProgressSchema.index({ match_id: 1, player_id: 1 });

export function playerProgressModel(connection: Connection): Model<IPlayerProgress> {
  return (
    (connection.models.PlayerProgress as Model<IPlayerProgress>) ??
    connection.model<IPlayerProgress>("PlayerProgress", playerProgressSchema)
  );
}
