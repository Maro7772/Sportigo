import fs from "node:fs";
import path from "node:path";
import { Game } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { Club } from "../models/Club";
import { Order, type OrderStatus } from "../models/Order";
import { PaymentMethod } from "../models/PaymentMethod";
import { SuperAdmin } from "../models/SuperAdmin";
import { Settings, getOrCreateSettings } from "../models/Settings";
import { env } from "../config/env";
import { UPLOAD_DIR } from "../config/upload";
import { calculateDiscountAmount } from "../utils/pricing";

const DAY_MS = 24 * 60 * 60 * 1000;
const SAMPLE_PROOF_URL = "/uploads/samples/payment-proof-sample.svg";

interface GameDefinition {
  name: string;
  actions: string[];
}

interface CycleDefinition {
  name: string;
  price: number;
  months: number;
  discount?: number;
  discount_type?: "percentage" | "amount";
}

interface PackageDefinition {
  name: string;
  teams: number;
  players: number;
  cycles: CycleDefinition[];
}

interface ClubDefinition {
  name: string;
  subdomain: string;
  game: string;
  package: string;
  status?: boolean;
  /** Days relative to today (negative = in the past). */
  startInDays: number;
  endInDays: number;
}

interface OrderDefinition {
  club: string;
  package: string;
  cycle: string;
  reference: string;
  status: OrderStatus;
  createdDaysAgo: number;
  paidDaysAgo?: number;
  fine?: number;
  paymentMethod: string;
  proof?: boolean;
  notes?: string;
  rejectionReason?: string;
}

const GAMES: GameDefinition[] = [
  {
    name: "Football",
    actions: [
      "Goal",
      "Assist",
      "Shot on target",
      "Pass completed",
      "Tackle",
      "Interception",
      "Save",
      "Yellow card",
      "Red card",
      "Corner",
      "Offside",
    ],
  },
  {
    name: "Basketball",
    actions: [
      "2-point shot",
      "3-point shot",
      "Free throw",
      "Rebound",
      "Assist",
      "Steal",
      "Block",
      "Turnover",
      "Foul",
      "Dunk",
    ],
  },
  {
    name: "Volleyball",
    actions: [
      "Serve ace",
      "Spike",
      "Block",
      "Dig",
      "Set",
      "Attack error",
      "Reception error",
      "Kill",
    ],
  },
  {
    name: "Handball",
    actions: [
      "Goal",
      "Assist",
      "Save",
      "7m goal",
      "2-minute suspension",
      "Steal",
      "Turnover",
      "Block",
    ],
  },
];

const PACKAGES: Record<string, PackageDefinition[]> = {
  Football: [
    {
      name: "Football Starter",
      teams: 2,
      players: 20,
      cycles: [
        { name: "Monthly", price: 750, months: 1 },
        { name: "Quarterly", price: 2025, months: 3, discount: 10 },
        { name: "Annual", price: 7200, months: 12, discount: 20 },
      ],
    },
    {
      name: "Football Pro",
      teams: 5,
      players: 25,
      cycles: [
        { name: "Monthly", price: 1500, months: 1 },
        { name: "Quarterly", price: 4050, months: 3, discount: 10 },
        { name: "Annual", price: 14400, months: 12, discount: 20 },
      ],
    },
    {
      name: "Football Elite",
      teams: 10,
      players: 30,
      cycles: [
        { name: "Monthly", price: 2500, months: 1 },
        { name: "Quarterly", price: 6750, months: 3, discount: 10 },
        { name: "Annual", price: 24000, months: 12, discount: 20 },
        { name: "Ramadan offer", price: 2500, months: 1, discount: 500, discount_type: "amount" },
      ],
    },
  ],
  Basketball: [
    {
      name: "Basketball Starter",
      teams: 2,
      players: 12,
      cycles: [
        { name: "Monthly", price: 600, months: 1 },
        { name: "Quarterly", price: 1620, months: 3, discount: 10 },
        { name: "Annual", price: 5760, months: 12, discount: 20 },
      ],
    },
    {
      name: "Basketball Pro",
      teams: 4,
      players: 15,
      cycles: [
        { name: "Monthly", price: 1200, months: 1 },
        { name: "Quarterly", price: 3240, months: 3, discount: 10 },
        { name: "Annual", price: 11520, months: 12, discount: 20 },
      ],
    },
    {
      name: "Basketball Elite",
      teams: 8,
      players: 18,
      cycles: [
        { name: "Monthly", price: 2000, months: 1 },
        { name: "Quarterly", price: 5400, months: 3, discount: 10 },
        { name: "Annual", price: 19200, months: 12, discount: 20 },
      ],
    },
  ],
  Volleyball: [
    {
      name: "Volleyball Starter",
      teams: 2,
      players: 14,
      cycles: [
        { name: "Monthly", price: 550, months: 1 },
        { name: "Quarterly", price: 1485, months: 3, discount: 10 },
        { name: "Annual", price: 5280, months: 12, discount: 20 },
      ],
    },
    {
      name: "Volleyball Pro",
      teams: 4,
      players: 16,
      cycles: [
        { name: "Monthly", price: 1100, months: 1 },
        { name: "Quarterly", price: 2970, months: 3, discount: 10 },
        { name: "Annual", price: 10560, months: 12, discount: 20 },
      ],
    },
    {
      name: "Volleyball Elite",
      teams: 8,
      players: 20,
      cycles: [
        { name: "Monthly", price: 1800, months: 1 },
        { name: "Quarterly", price: 4860, months: 3, discount: 10 },
        { name: "Annual", price: 17280, months: 12, discount: 20 },
      ],
    },
  ],
  Handball: [
    {
      name: "Handball Starter",
      teams: 2,
      players: 14,
      cycles: [
        { name: "Monthly", price: 500, months: 1 },
        { name: "Quarterly", price: 1350, months: 3, discount: 10 },
        { name: "Annual", price: 4800, months: 12, discount: 20 },
      ],
    },
    {
      name: "Handball Pro",
      teams: 4,
      players: 16,
      cycles: [
        { name: "Monthly", price: 1000, months: 1 },
        { name: "Quarterly", price: 2700, months: 3, discount: 10 },
        { name: "Annual", price: 9600, months: 12, discount: 20 },
      ],
    },
  ],
};

const PAYMENT_METHODS = [
  { name: "Cash", description: "Cash payment at the club office" },
  { name: "Bank Transfer", description: "Direct bank transfer to the platform account" },
  { name: "Vodafone Cash", description: "Mobile wallet payment via Vodafone Cash" },
  { name: "InstaPay", description: "Instant bank transfer through InstaPay" },
  { name: "Credit Card", description: "Visa / Mastercard online payment" },
];

const CLUBS: ClubDefinition[] = [
  {
    name: "Al Ahly SC",
    subdomain: "ahly",
    game: "Football",
    package: "Football Elite",
    startInDays: -120,
    endInDays: 245,
  },
  {
    name: "Zamalek SC",
    subdomain: "zamalek",
    game: "Football",
    package: "Football Pro",
    startInDays: -30,
    endInDays: 335,
  },
  {
    name: "Cairo Basketball Club",
    subdomain: "cairo-basketball",
    game: "Basketball",
    package: "Basketball Pro",
    startInDays: -75,
    endInDays: 290,
  },
  {
    name: "Alexandria Volleyball Club",
    subdomain: "alex-volley",
    game: "Volleyball",
    package: "Volleyball Pro",
    startInDays: -10,
    endInDays: 5,
  },
  {
    name: "Giza Handball Club",
    subdomain: "giza-handball",
    game: "Handball",
    package: "Handball Starter",
    startInDays: -365,
    endInDays: -3,
  },
  {
    name: "Smouha SC",
    subdomain: "smouha",
    game: "Football",
    package: "Football Starter",
    startInDays: -400,
    endInDays: -20,
  },
  {
    name: "Tanta Sports Club",
    subdomain: "tanta",
    game: "Basketball",
    package: "Basketball Starter",
    startInDays: 10,
    endInDays: 375,
  },
  {
    name: "Pyramids FC",
    subdomain: "pyramids",
    game: "Football",
    package: "Football Pro",
    status: false,
    startInDays: -200,
    endInDays: 165,
  },
];

const ORDERS: OrderDefinition[] = [
  {
    club: "ahly",
    package: "Football Elite",
    cycle: "Annual",
    reference: "SEED-AHLY-ANNUAL-01",
    status: "paid",
    createdDaysAgo: 160,
    paidDaysAgo: 159,
    paymentMethod: "Bank Transfer",
    proof: true,
  },
  {
    club: "ahly",
    package: "Football Elite",
    cycle: "Quarterly",
    reference: "SEED-AHLY-QUARTER-01",
    status: "paid",
    createdDaysAgo: 65,
    paidDaysAgo: 64,
    paymentMethod: "InstaPay",
  },
  {
    club: "ahly",
    package: "Football Elite",
    cycle: "Monthly",
    reference: "SEED-AHLY-PENDING-01",
    status: "pending",
    createdDaysAgo: 2,
    paymentMethod: "Vodafone Cash",
    proof: true,
    notes: "Renewal for the new season",
  },
  {
    club: "ahly",
    package: "Football Elite",
    cycle: "Monthly",
    reference: "SEED-AHLY-REJECTED-01",
    status: "rejected",
    createdDaysAgo: 20,
    paymentMethod: "Vodafone Cash",
    rejectionReason: "Duplicate payment - already renewed with the quarterly order",
  },
  {
    club: "zamalek",
    package: "Football Pro",
    cycle: "Annual",
    reference: "SEED-ZAMALEK-ANNUAL-01",
    status: "paid",
    createdDaysAgo: 200,
    paidDaysAgo: 199,
    paymentMethod: "Bank Transfer",
    proof: true,
  },
  {
    club: "zamalek",
    package: "Football Pro",
    cycle: "Quarterly",
    reference: "SEED-ZAMALEK-PENDING-01",
    status: "pending",
    createdDaysAgo: 1,
    paymentMethod: "InstaPay",
    proof: true,
  },
  {
    club: "cairo-basketball",
    package: "Basketball Pro",
    cycle: "Quarterly",
    reference: "SEED-CAIRO-BB-QUARTER-01",
    status: "paid",
    createdDaysAgo: 130,
    paidDaysAgo: 129,
    paymentMethod: "Credit Card",
    proof: true,
  },
  {
    club: "cairo-basketball",
    package: "Basketball Pro",
    cycle: "Monthly",
    reference: "SEED-CAIRO-BB-MONTHLY-01",
    status: "paid",
    createdDaysAgo: 25,
    paidDaysAgo: 24,
    paymentMethod: "Cash",
  },
  {
    club: "cairo-basketball",
    package: "Basketball Pro",
    cycle: "Monthly",
    reference: "SEED-CAIRO-BB-PENDING-01",
    status: "pending",
    createdDaysAgo: 3,
    paymentMethod: "Vodafone Cash",
    proof: true,
  },
  {
    club: "alex-volley",
    package: "Volleyball Pro",
    cycle: "Annual",
    reference: "SEED-ALEX-VOLLEY-ANNUAL-01",
    status: "paid",
    createdDaysAgo: 95,
    paidDaysAgo: 94,
    paymentMethod: "Bank Transfer",
    proof: true,
  },
  {
    club: "alex-volley",
    package: "Volleyball Pro",
    cycle: "Monthly",
    reference: "SEED-ALEX-VOLLEY-PENDING-01",
    status: "pending",
    createdDaysAgo: 4,
    paymentMethod: "InstaPay",
    proof: true,
  },
  {
    club: "giza-handball",
    package: "Handball Starter",
    cycle: "Monthly",
    reference: "SEED-GIZA-HANDBALL-PENDING-01",
    status: "pending",
    createdDaysAgo: 2,
    fine: 200,
    paymentMethod: "Vodafone Cash",
    proof: true,
    notes: "Late renewal - inside the grace period",
  },
  {
    club: "giza-handball",
    package: "Handball Starter",
    cycle: "Monthly",
    reference: "SEED-GIZA-HANDBALL-REJECTED-01",
    status: "rejected",
    createdDaysAgo: 35,
    paymentMethod: "Vodafone Cash",
    rejectionReason: "Receipt does not match the order amount",
  },
  {
    club: "smouha",
    package: "Football Starter",
    cycle: "Monthly",
    reference: "SEED-SMOUHA-PENDING-01",
    status: "pending",
    createdDaysAgo: 5,
    paymentMethod: "Cash",
    proof: true,
    notes: "Waiting for the super admin to confirm the cash payment",
  },
  {
    club: "smouha",
    package: "Football Starter",
    cycle: "Monthly",
    reference: "SEED-SMOUHA-REJECTED-01",
    status: "rejected",
    createdDaysAgo: 45,
    paymentMethod: "Bank Transfer",
    rejectionReason: "Payment was not received",
  },
  {
    club: "tanta",
    package: "Basketball Starter",
    cycle: "Monthly",
    reference: "SEED-TANTA-PENDING-01",
    status: "pending",
    createdDaysAgo: 1,
    paymentMethod: "InstaPay",
    proof: true,
  },
  {
    club: "pyramids",
    package: "Football Pro",
    cycle: "Annual",
    reference: "SEED-PYRAMIDS-ANNUAL-01",
    status: "paid",
    createdDaysAgo: 240,
    paidDaysAgo: 239,
    paymentMethod: "Bank Transfer",
    proof: true,
  },
  {
    club: "pyramids",
    package: "Football Pro",
    cycle: "Monthly",
    reference: "SEED-PYRAMIDS-REFUNDED-01",
    status: "refunded",
    createdDaysAgo: 50,
    paymentMethod: "Credit Card",
    notes: "Refunded after the club changed its package",
  },
];

const SAMPLE_PROOF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <rect width="480" height="640" fill="#f8fafc"/>
  <rect x="24" y="24" width="432" height="592" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
  <text x="48" y="80" font-family="Arial, sans-serif" font-size="26" font-weight="bold" fill="#0f172a">Payment Receipt</text>
  <text x="48" y="112" font-family="Arial, sans-serif" font-size="15" fill="#64748b">Scouting Platform - sample proof</text>
  <line x1="48" y1="136" x2="432" y2="136" stroke="#e2e8f0" stroke-width="2"/>
  <text x="48" y="180" font-family="Arial, sans-serif" font-size="16" fill="#334155">Reference</text>
  <text x="432" y="180" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#0f172a">SEED-PROOF-0001</text>
  <text x="48" y="220" font-family="Arial, sans-serif" font-size="16" fill="#334155">Amount</text>
  <text x="432" y="220" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#0f172a">EGP 2,500.00</text>
  <text x="48" y="260" font-family="Arial, sans-serif" font-size="16" fill="#334155">Method</text>
  <text x="432" y="260" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#0f172a">Vodafone Cash</text>
  <text x="48" y="300" font-family="Arial, sans-serif" font-size="16" fill="#334155">Status</text>
  <text x="432" y="300" text-anchor="end" font-family="Arial, sans-serif" font-size="16" fill="#16a34a">Transferred</text>
  <line x1="48" y1="340" x2="432" y2="340" stroke="#e2e8f0" stroke-width="2"/>
  <text x="48" y="390" font-family="Arial, sans-serif" font-size="14" fill="#64748b">This is a sample image generated by the seed</text>
  <text x="48" y="412" font-family="Arial, sans-serif" font-size="14" fill="#64748b">script to demo the payment-proof upload flow.</text>
  <rect x="48" y="470" width="384" height="96" rx="12" fill="#ecfdf5" stroke="#86efac" stroke-width="2"/>
  <text x="240" y="510" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#166534">Sample receipt</text>
  <text x="240" y="538" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#15803d">Replace it with a real screenshot from the club</text>
</svg>
`;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

function writeSampleProof(): void {
  const directory = path.join(UPLOAD_DIR, "samples");
  fs.mkdirSync(directory, { recursive: true });

  const filePath = path.join(directory, "payment-proof-sample.svg");
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, SAMPLE_PROOF_SVG, "utf8");
  }
}

export interface SeedSummary {
  games: number;
  actions: number;
  packages: number;
  paymentMethods: number;
  clubs: number;
  orders: number;
}

/**
 * Realistic, idempotent seed for a demo/real environment.
 * Running it twice never duplicates records (every entity has a natural key).
 */
export async function seedRealData(): Promise<SeedSummary> {
  const summary: SeedSummary = {
    games: 0,
    actions: 0,
    packages: 0,
    paymentMethods: 0,
    clubs: 0,
    orders: 0,
  };

  writeSampleProof();

  await getOrCreateSettings();

  await Settings.updateOne(
    { key: "global" },
    { $set: { allowed_days: 7, notification: true, fines: 200 } }
  );

  const superAdmin = await SuperAdmin.findOne({
    email: env.SUPER_ADMIN_EMAIL || "admin@gmail.com",
  }).lean();
  const adminId = superAdmin?._id ?? null;

  // Games + actions
  for (const gameDefinition of GAMES) {
    let game = await Game.findOne({ name: gameDefinition.name });

    if (!game) {
      game = await Game.create({ name: gameDefinition.name, status: true });
      summary.games += 1;
    }

    for (const actionName of gameDefinition.actions) {
      const result = await Action.updateOne(
        { game_id: game._id, name: actionName },
        { $setOnInsert: { game_id: game._id, name: actionName, status: true } },
        { upsert: true }
      );

      if (result.upsertedCount > 0) summary.actions += 1;
    }
  }

  // Payment methods
  for (const method of PAYMENT_METHODS) {
    const result = await PaymentMethod.updateOne(
      { name: method.name },
      { $setOnInsert: { ...method, status: true } },
      { upsert: true }
    );

    if (result.upsertedCount > 0) summary.paymentMethods += 1;
  }

  // Packages
  for (const [gameName, definitions] of Object.entries(PACKAGES)) {
    const game = await Game.findOne({ name: gameName });
    if (!game) continue;

    for (const definition of definitions) {
      const exists = await Package.findOne({
        game_id: game._id,
        name: definition.name,
      });

      if (exists) continue;

      await Package.create({
        game_id: game._id,
        name: definition.name,
        teams: definition.teams,
        players: definition.players,
        status: true,
        cycles: definition.cycles.map((cycle) => ({
          name: cycle.name,
          price: cycle.price,
          months: cycle.months,
          discount: cycle.discount ?? 0,
          discount_type: cycle.discount_type ?? "percentage",
        })),
      });

      summary.packages += 1;
    }
  }

  // Clubs
  for (const definition of CLUBS) {
    const exists = await Club.findOne({ subdomain: definition.subdomain });
    if (exists) continue;

    const game = await Game.findOne({ name: definition.game });
    const pkg = game
      ? await Package.findOne({ game_id: game._id, name: definition.package })
      : null;

    await Club.create({
      name: definition.name,
      subdomain: definition.subdomain,
      status: definition.status ?? true,
      package_id: pkg?._id ?? null,
      start_date: daysFromNow(definition.startInDays),
      end_date: daysFromNow(definition.endInDays),
    });

    summary.clubs += 1;
  }

  // Orders
  for (const definition of ORDERS) {
    const existing = await Order.findOne({
      payment_reference: definition.reference,
    });
    if (existing) continue;

    const club = await Club.findOne({ subdomain: definition.club });
    if (!club) continue;

    const game = club.package_id
      ? await Package.findById(club.package_id).select("game_id").lean()
      : null;
    const pkg = game
      ? await Package.findOne({ game_id: game.game_id, name: definition.package })
      : null;

    if (!pkg) continue;

    const cycle = pkg.cycles.find((item) => item.name === definition.cycle);
    if (!cycle) continue;

    const paymentMethod = await PaymentMethod.findOne({
      name: definition.paymentMethod,
    });
    if (!paymentMethod) continue;

    const discount = calculateDiscountAmount(
      cycle.price,
      cycle.discount,
      cycle.discount_type
    );
    const fine = definition.fine ?? 0;
    const createdAt = daysAgo(definition.createdDaysAgo);
    const paidAt =
      definition.status === "paid"
        ? daysAgo(definition.paidDaysAgo ?? definition.createdDaysAgo)
        : null;

    const order = await Order.create({
      club_id: club._id,
      package_id: pkg._id,
      cycle_id: cycle._id,
      payment_method_id: paymentMethod._id,
      price: cycle.price,
      discount,
      fine,
      status: definition.status,
      payment_proof: definition.proof ? SAMPLE_PROOF_URL : null,
      payment_reference: definition.reference,
      notes: definition.notes ?? null,
      rejection_reason: definition.rejectionReason ?? null,
      rejected_at:
        definition.status === "rejected" ? daysAgo(definition.createdDaysAgo - 1) : null,
      approved_by: definition.status === "paid" ? adminId : null,
      approved_at: paidAt,
      applied_to_subscription: definition.status === "paid",
      applied_at: paidAt,
    });

    // Backdate the timestamps so the dashboard chart looks realistic.
    await Order.collection.updateOne(
      { _id: order._id },
      {
        $set: {
          createdAt,
          updatedAt: paidAt ?? createdAt,
          paid_at: paidAt,
        },
      }
    );

    summary.orders += 1;
  }

  return summary;
}
