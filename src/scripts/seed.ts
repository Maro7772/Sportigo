import { connectDB, disconnectDB } from "../config/db";
import { env } from "../config/env";
import { ensureInitialSuperAdmin, ensureSettings } from "../services/bootstrap.service";
import { seedDemoData } from "../services/demoSeed.service";

async function main(): Promise<void> {
  const withDemo = process.argv.includes("--demo");

  await connectDB();

  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) {
    console.warn(
      "⚠️  Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env to create the first super admin"
    );
  } else {
    await ensureInitialSuperAdmin();
  }

  await ensureSettings();

  if (withDemo) {
    await seedDemoData();
  }

  console.log("✅ Seeding finished");
}

main()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
