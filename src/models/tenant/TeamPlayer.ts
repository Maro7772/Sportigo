import { Schema, type Connection, type Model, type Types } from "mongoose";

/**
 * Tenant collection: `team-players`
 * The players of a team. `game_id` is duplicated on purpose so a player can be
 * filtered by game without joining the team.
 */
export interface ITeamPlayer {
  game_id: Types.ObjectId;
  team_id: Types.ObjectId;
  name: string;
  /** Centimeters. */
  height: number;
  /** Kilograms. */
  weight: number;
  /** Years. */
  age: number;
  createdAt: Date;
  updatedAt: Date;
}

export const teamPlayerSchema = new Schema<ITeamPlayer>(
  {
    game_id: { type: Schema.Types.ObjectId, required: true, index: true },
    team_id: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    height: { type: Number, required: true, min: 50, max: 260 },
    weight: { type: Number, required: true, min: 20, max: 250 },
    age: { type: Number, required: true, min: 5, max: 70 },
  },
  { timestamps: true, versionKey: false, collection: "team-players" }
);

teamPlayerSchema.index({ team_id: 1, name: 1 }, { unique: true });

export function teamPlayerModel(connection: Connection): Model<ITeamPlayer> {
  return (
    (connection.models.TeamPlayer as Model<ITeamPlayer>) ??
    connection.model<ITeamPlayer>("TeamPlayer", teamPlayerSchema)
  );
}
