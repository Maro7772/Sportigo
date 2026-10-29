import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../config/db";
import { SuperAdmin } from "../models/SuperAdmin";
import { Game } from "../models/Game";
import { Action } from "../models/Action";
import { Package } from "../models/Package";
import { Club } from "../models/Club";
import { Order } from "../models/Order";
import { PaymentMethod } from "../models/PaymentMethod";
import { Settings } from "../models/Settings";
import { tenantStats } from "../config/tenant";

const MODELS = [
  { name: "superadmins", model: SuperAdmin },
  { name: "games", model: Game },
  { name: "actions", model: Action },
  { name: "packages", model: Package },
  { name: "clubs", model: Club },
  { name: "orders", model: Order },
  { name: "payment_methods", model: PaymentMethod },
  { name: "settings", model: Settings },
] as const;

async function main(): Promise<void> {
  await connectDB();

  const db = mongoose.connection.db;
  if (!db) throw new Error("No database connection");

  await db.admin().ping();

  const serverInfo = await db.admin().serverInfo().catch(() => null);

  console.log("────────────────────────────────────────");
  console.log(`Database : ${db.databaseName}`);
  console.log(`Host     : ${mongoose.connection.host}`);
  if (serverInfo?.version) console.log(`MongoDB  : ${serverInfo.version}`);
  console.log("────────────────────────────────────────");

  const collections = await db.listCollections().toArray();
  console.log(`Collections found: ${collections.length}`);

  for (const entry of MODELS) {
    const count = await entry.model.countDocuments();
    console.log(`  ${entry.name.padEnd(18)} ${count}`);
  }

  console.log("────────────────────────────────────────");
  console.log("Tenant databases");
  const clubs = await Club.find().select("subdomain").sort({ subdomain: 1 }).lean();

  for (const club of clubs) {
    const stats = await tenantStats(club.subdomain);
    const summary = Object.entries(stats.collections)
      .map(([name, count]) => `${name}=${count}`)
      .join(" ");

    console.log(`  ${stats.database.padEnd(20)} ${stats.documents} docs  ${summary}`);
  }

  console.log("────────────────────────────────────────");
  console.log("✅ Database connection OK");
}

main()
  .catch((error) => {
    console.error("❌ Database check failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
