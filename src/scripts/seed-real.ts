import { connectDB, disconnectDB } from "../config/db";
import { env } from "../config/env";
import { ensureInitialSuperAdmin, ensureSettings } from "../services/bootstrap.service";
import { seedRealData } from "../services/realSeed.service";

/**
 * Populates the configured database with realistic data:
 * 4 games + actions, packages with cycles, payment methods, clubs in every
 * subscription state, and orders in every status.
 *
 * Safe to run more than once - nothing is duplicated.
 *
 * Run with: npm run seed:real
 */
async function main(): Promise<void> {
  await connectDB();

  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    console.warn(
      "⚠️  Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env to create the first super admin"
    );
  } else {
    await ensureInitialSuperAdmin();
  }

  await ensureSettings();

  const summary = await seedRealData();

  console.log("────────────────────────────────────────");
  console.log("✅ Realistic seed finished");
  console.log(`  Games created            ${summary.games}`);
  console.log(`  Actions created          ${summary.actions}`);
  console.log(`  Packages created         ${summary.packages}`);
  console.log(`  Payment methods created  ${summary.paymentMethods}`);
  console.log(`  Clubs created            ${summary.clubs}`);
  console.log(`  Orders created           ${summary.orders}`);
  console.log("────────────────────────────────────────");
  console.log("Settings: allowed_days=7, fines=200, notification=true");
}

main()
  .catch((error) => {
    console.error("❌ Realistic seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
