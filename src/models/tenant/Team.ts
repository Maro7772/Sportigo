import { Schema, type Connection, type Model, type Types } from "mongoose";

/**
 * Tenant collection: `team`
 * A team belongs to one game (the game itself lives in the central database).
 */
export interface ITeam {
  name: string;
  /** Auto-computed: number of players in `team-players` for this team. */
  players: number;
  /** Central `Game` id. */
  game_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    players: { type: Number, default: 0, min: 0 },
    game_id: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true, versionKey: false, collection: "team" }
);

teamSchema.index({ game_id: 1, name: 1 }, { unique: true });

export function teamModel(connection: Connection): Model<ITeam> {
  return (
    (connection.models.Team as Model<ITeam>) ??
    connection.model<ITeam>("Team", teamSchema)
  );
}
