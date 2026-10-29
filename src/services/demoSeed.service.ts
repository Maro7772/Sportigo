import { Game } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { Club } from "../models/Club";
import { Order } from "../models/Order";
import { PaymentMethod } from "../models/PaymentMethod";

/**
 * Idempotent demo data. Every record is created only if it does not exist yet,
 * so running `npm run seed:demo` again will not duplicate anything.
 */
export async function seedDemoData(): Promise<void> {
  const game =
    (await Game.findOne({ name: "Football" })) ??
    (await Game.create({ name: "Football", status: true }));

  const actionNames = [
    "Goal",
    "Assist",
    "Shoot on target",
    "Pass completed",
    "Tackle",
    "Interception",
    "Save",
    "Yellow card",
    "Red card",
  ];

  for (const name of actionNames) {
    await Action.updateOne(
      { game_id: game._id, name },
      { $setOnInsert: { game_id: game._id, name, status: true } },
      { upsert: true }
    );
  }

  const paymentMethods = [
    { name: "Cash", description: "Cash payment at the club office" },
    { name: "Bank transfer", description: "Direct bank transfer" },
    { name: "Visa / Mastercard", description: "Online card payment" },
    { name: "Wallet", description: "Mobile wallet payment" },
  ];

  for (const method of paymentMethods) {
    await PaymentMethod.updateOne(
      { name: method.name },
      { $setOnInsert: { ...method, status: true } },
      { upsert: true }
    );
  }

  const packageDefinitions = [
    {
      name: "Basic",
      teams: 1,
      players: 20,
      cycles: [
        { name: "Monthly", discount_type: "percentage", discount: 0, price: 500, months: 1 },
        { name: "Quarterly", discount_type: "percentage", discount: 10, price: 1350, months: 3 },
      ],
    },
    {
      name: "Pro",
      teams: 3,
      players: 25,
      cycles: [
        { name: "Monthly", discount_type: "percentage", discount: 0, price: 900, months: 1 },
        { name: "Annual", discount_type: "percentage", discount: 20, price: 8640, months: 12 },
      ],
    },
    {
      name: "Elite",
      teams: 10,
      players: 30,
      cycles: [
        { name: "Monthly", discount_type: "percentage", discount: 0, price: 1500, months: 1 },
        { name: "Annual", discount_type: "percentage", discount: 25, price: 13500, months: 12 },
        { name: "Special", discount_type: "amount", discount: 300, price: 1500, months: 1 },
      ],
    },
  ];

  for (const definition of packageDefinitions) {
    const exists = await Package.findOne({ game_id: game._id, name: definition.name });
    if (!exists) {
      await Package.create({ ...definition, game_id: game._id, status: true });
    }
  }

  const elite = await Package.findOne({ game_id: game._id, name: "Elite" });
  let club = await Club.findOne({ subdomain: "demo-club" });

  if (!club) {
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + 12);

    club = await Club.create({
      name: "Demo Club",
      subdomain: "demo-club",
      status: true,
      package_id: elite?._id ?? null,
      start_date: start,
      end_date: end,
    });
  }

  const cash = await PaymentMethod.findOne({ name: "Cash" });
  if (elite && cash) {
    const cycle = elite.cycles[0];
    const existingOrder = await Order.findOne({
      club_id: club._id,
      package_id: elite._id,
      cycle_id: cycle?._id ?? null,
    });

    if (!existingOrder) {
      await Order.create({
        club_id: club._id,
        package_id: elite._id,
        cycle_id: cycle?._id ?? null,
        payment_method_id: cash._id,
        price: cycle?.price ?? elite.cycles[0]?.price ?? 0,
        discount: 0,
        fine: 0,
        status: "paid",
        notes: "Demo order",
      });
    }
  }

  console.log("✅ Demo data ready (game, actions, packages, payment methods, demo club + order)");
}
