import type { Types } from "mongoose";
import { Club } from "../models/Club";
import { Game } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { getTenantConnection } from "../config/tenant";
import {
  ensureTenantIndexes,
  getOrCreateTenantSettings,
  getTenantModels,
  type TenantModels,
} from "../models/tenant";
import { ensureTenantAdmin } from "./tenantAuth.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const PLAYER_NAMES = [
  "Ahmed Hassan",
  "Mohamed Salah",
  "Omar Khaled",
  "Youssef Ibrahim",
  "Karim Adel",
  "Hassan Ali",
  "Mahmoud Zaki",
  "Mostafa Nour",
  "Ali Gamal",
  "Tarek Sami",
  "Amr Fathy",
  "Hossam Eid",
  "Sherif Magdy",
  "Ramy Tawfik",
  "Nader Ashraf",
  "Wael Sayed",
];

interface GameProfile {
  height: [number, number];
  weight: [number, number];
}

const GAME_PROFILES: Record<string, GameProfile> = {
  Football: { height: [168, 190], weight: [62, 86] },
  Basketball: { height: [183, 208], weight: [72, 105] },
  Volleyball: { height: [180, 205], weight: [70, 96] },
  Handball: { height: [172, 196], weight: [70, 95] },
};

const DEFAULT_PROFILE: GameProfile = { height: [170, 195], weight: [65, 95] };

const CLUB_PALETTES = [
  { background_color: ["#0f172a", "#1e293b"], color: ["#16a34a", "#22c55e"] },
  { background_color: ["#1e1b4b", "#312e81"], color: ["#f59e0b", "#fbbf24"] },
  { background_color: ["#111827", "#1f2937"], color: ["#3b82f6", "#60a5fa"] },
  { background_color: ["#3b0764", "#581c87"], color: ["#ec4899", "#f472b6"] },
];

interface MatchSeed {
  name: string;
  daysAgo: number;
  /** "pair" -> team1_id + team2_id, "single" -> team_id + opponent_name */
  shape: "pair" | "single";
  teamIndex: 0 | 1;
  opponent?: string;
}

const MATCHES: MatchSeed[] = [
  { name: "League Round 1", daysAgo: 60, shape: "pair", teamIndex: 0 },
  { name: "League Round 2", daysAgo: 45, shape: "single", teamIndex: 0, opponent: "Cairo Stars" },
  { name: "League Round 3", daysAgo: 30, shape: "single", teamIndex: 1, opponent: "Alex United" },
  { name: "League Round 4", daysAgo: 14, shape: "pair", teamIndex: 0 },
  { name: "League Round 5", daysAgo: 7, shape: "single", teamIndex: 0, opponent: "Delta Club" },
  { name: "Friendly Match", daysAgo: 3, shape: "single", teamIndex: 1, opponent: "Smouha Academy" },
];

/** Small deterministic PRNG so re-runs generate the same numbers. */
function makeRandom(seed: number) {
  let state = seed || 1;

  return (): number => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_000_007;
  }
  return hash;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

export interface TenantSeedSummary {
  subdomain: string;
  database: string;
  game: string | null;
  teams: number;
  players: number;
  matches: number;
  progress: number;
  skipped?: string;
}

/** Resolves the game of a club from its package, falling back to the first game. */
async function resolveClubGame(club: {
  package_id?: Types.ObjectId | null;
}): Promise<{ gameId: Types.ObjectId; gameName: string } | null> {
  if (club.package_id) {
    const pkg = await Package.findById(club.package_id).select("game_id").lean();
    if (pkg) {
      const game = await Game.findById(pkg.game_id).select("name").lean();
      if (game) return { gameId: game._id, gameName: game.name };
    }
  }

  const game = await Game.findOne({ status: true }).sort({ name: 1 }).lean();
  if (!game) return null;

  return { gameId: game._id, gameName: game.name };
}

async function seedTenant(
  subdomain: string,
  models: TenantModels,
  gameId: Types.ObjectId,
  gameName: string
): Promise<Omit<TenantSeedSummary, "subdomain" | "database">> {
  const summary = { game: gameName, teams: 0, players: 0, matches: 0, progress: 0 };

  const profile = GAME_PROFILES[gameName] ?? DEFAULT_PROFILE;
  const random = makeRandom(hashString(subdomain));

  // 1. Teams
  const teamNames = ["First Team", "U18"];
  const teams = [];

  for (const name of teamNames) {
    let team = await models.Team.findOne({ game_id: gameId, name });

    if (!team) {
      team = await models.Team.create({ name, game_id: gameId, players: 0 });
      summary.teams += 1;
    }

    teams.push(team);
  }

  // 2. Players
  for (const [teamIndex, team] of teams.entries()) {
    for (let index = 0; index < 8; index += 1) {
      const name = PLAYER_NAMES[(teamIndex * 8 + index) % PLAYER_NAMES.length];

      const exists = await models.TeamPlayer.findOne({ team_id: team._id, name });
      if (exists) continue;

      const height =
        profile.height[0] + Math.round(random() * (profile.height[1] - profile.height[0]));
      const weight =
        profile.weight[0] + Math.round(random() * (profile.weight[1] - profile.weight[0]));

      await models.TeamPlayer.create({
        team_id: team._id,
        game_id: gameId,
        name,
        height,
        weight,
        age: 17 + Math.floor(random() * 12),
      });

      summary.players += 1;
    }

    const playersCount = await models.TeamPlayer.countDocuments({ team_id: team._id });
    await models.Team.updateOne({ _id: team._id }, { $set: { players: playersCount } });
  }

  // 3. Matches
  const actions = await Action.find({ game_id: gameId, status: true })
    .select("name")
    .sort({ name: 1 })
    .lean();

  for (const definition of MATCHES) {
    const existing = await models.Match.findOne({ name: definition.name });
    if (existing) continue;

    const primary = teams[definition.teamIndex];
    const secondary = teams[definition.teamIndex === 0 ? 1 : 0];

    await models.Match.create(
      definition.shape === "pair"
        ? {
            name: definition.name,
            date: daysAgo(definition.daysAgo),
            team1_id: primary._id,
            team2_id: secondary._id,
          }
        : {
            name: definition.name,
            date: daysAgo(definition.daysAgo),
            team_id: primary._id,
            opponent_name: definition.opponent ?? "Outside Opponent",
          }
    );

    summary.matches += 1;
  }

  // 4. Player progress
  if (actions.length) {
    const matches = await models.Match.find().sort({ date: 1 }).lean();

    for (const match of matches) {
      const teamIds = [match.team_id, match.team1_id, match.team2_id].filter(Boolean);
      const players = await models.TeamPlayer.find({ team_id: { $in: teamIds } })
        .select("_id")
        .lean();

      if (!players.length) continue;

      for (let index = 0; index < 12; index += 1) {
        const player = players[Math.floor(random() * players.length)];
        const action = actions[Math.floor(random() * actions.length)];

        const exists = await models.PlayerProgress.findOne({
          match_id: match._id,
          player_id: player._id,
          action_id: action._id,
        });
        if (exists) continue;

        await models.PlayerProgress.create({
          match_id: match._id,
          player_id: player._id,
          action_id: action._id,
        });

        summary.progress += 1;
      }
    }
  }

  return summary;
}

/**
 * Seeds the tenant database(s) of the given clubs (or all clubs when no
 * subdomain is passed). Safe to run more than once - nothing is duplicated.
 */
export async function seedTenantData(
  subdomains?: string[]
): Promise<TenantSeedSummary[]> {
  const filter = subdomains?.length ? { subdomain: { $in: subdomains } } : {};
  const clubs = await Club.find(filter).sort({ subdomain: 1 }).lean();

  const summaries: TenantSeedSummary[] = [];

  for (const club of clubs) {
    const game = await resolveClubGame(club);

    if (!game) {
      summaries.push({
        subdomain: club.subdomain,
        database: club.subdomain,
        game: null,
        teams: 0,
        players: 0,
        matches: 0,
        progress: 0,
        skipped: "No game found in the central database",
      });
      continue;
    }

    const connection = getTenantConnection(club.subdomain);
    const models = getTenantModels(connection);

    await ensureTenantIndexes(models);

    const settings = await getOrCreateTenantSettings(models);
    const isFreshTenant = (await models.Team.countDocuments()) === 0;

    // Every club needs at least one account to log in with.
    // 👇 التعديل هنا: إضافة الإيميل والباسورد الافتراضيين للسيدر
    await ensureTenantAdmin(models, club.subdomain, {
      name: `${club.name} Admin`,
      email: `admin@${club.subdomain}.com`,
      password: "Admin@123456",
    });

    if (isFreshTenant) {
      const palette = CLUB_PALETTES[hashString(club.subdomain) % CLUB_PALETTES.length];
      settings.background_color = palette.background_color;
      settings.color = palette.color;
      await settings.save();
    }

    const summary = await seedTenant(club.subdomain, models, game.gameId, game.gameName);

    summaries.push({
      subdomain: club.subdomain,
      database: connection.name,
      ...summary,
    });
  }

  return summaries;
}