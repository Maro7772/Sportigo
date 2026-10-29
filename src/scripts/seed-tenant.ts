import { connectDB, disconnectDB } from "../config/db";
import { seedTenantData } from "../services/tenantSeed.service";

/**
 * Seeds the tenant databases with realistic scouting data:
 * 2 teams, 8 players per team, 6 matches (both match shapes) and
 * player-progress rows for every match.
 *
 * Run with:
 *   npm run seed:tenant                (all clubs)
 *   npm run seed:tenant -- ahly        (one club)
 *   npm run seed:tenant -- ahly zamalek
 */
async function main(): Promise<void> {
  const subdomains = process.argv.slice(2).filter((value) => !value.startsWith("--"));

  await connectDB();

  const summaries = await seedTenantData(subdomains.length ? subdomains : undefined);

  console.log("────────────────────────────────────────");
  console.log("✅ Tenant seed finished");

  for (const summary of summaries) {
    if (summary.skipped) {
      console.log(`  ${summary.subdomain.padEnd(18)} skipped: ${summary.skipped}`);
      continue;
    }

    console.log(
      `  ${summary.subdomain.padEnd(18)} db=${summary.database.padEnd(18)} game=${String(
        summary.game
      ).padEnd(11)} +teams=${summary.teams} +players=${summary.players} +matches=${summary.matches} +progress=${summary.progress}`
    );
  }

  console.log("────────────────────────────────────────");
}

main()
  .catch((error) => {
    console.error("❌ Tenant seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
