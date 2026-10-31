import { Schema, type Connection, type Model, type Types } from "mongoose";

/**
 * Tenant collection: `match`
 *
 * Two shapes are supported:
 * 1. `team_id`                     -> one of our teams plays an outside team
 *                                     (the opponent name can be stored in `opponent_name`).
 * 2. `team1_id` + `team2_id`       -> both teams are on the platform.
 */
export interface IMatch {
  name: string;
  date: Date;
  /** Single team shape (opponent is not on the platform). */
  team_id?: Types.ObjectId | null;
  /** Both-teams shape: the two platform teams that played each other. */
  team1_id?: Types.ObjectId | null;
  team2_id?: Types.ObjectId | null;
  /** Name of the outside opponent (only with `team_id`). */
  opponent_name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const matchSchema = new Schema<IMatch>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    date: { type: Date, required: true, index: true },
    team_id: { type: Schema.Types.ObjectId, default: null, index: true },
    team1_id: { type: Schema.Types.ObjectId, default: null, index: true },
    team2_id: { type: Schema.Types.ObjectId, default: null, index: true },
    opponent_name: { type: String, default: null, trim: true, maxlength: 150 },
  },
  { timestamps: true, versionKey: false, collection: "match" }
);

matchSchema.index({ team1_id: 1, team2_id: 1 });

matchSchema.pre("validate", function validateTeams(next) {
  // Legacy alias: team1_id is accepted as an alias for team_id.
  if (!this.team_id && this.team1_id) {
    this.team_id = this.team1_id as any;
  }

  if (!this.team_id) {
    this.invalidate("team_id", "team_id is required");
    return next();
  }

  if (this.team2_id && String(this.team2_id) === String(this.team_id)) {
    this.invalidate("team2_id", "team2 must be different from team");
    return next();
  }

  next();
});

export function matchModel(connection: Connection): Model<IMatch> {
  return (
    (connection.models.Match as Model<IMatch>) ??
    connection.model<IMatch>("Match", matchSchema)
  );
}
