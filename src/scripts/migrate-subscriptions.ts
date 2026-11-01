import { connectDB } from "../config/db";
import { Club } from "../models/Club";

async function main() {
  await connectDB();
  const clubs = await Club.find({});
  let n = 0;
  for (const club of clubs) {
    if (!club.subscriptions || club.subscriptions.length === 0) {
      if (club.package_id) {
        club.subscriptions = [
          {
            package_id: club.package_id,
            cycle_id: club.cycle_id ?? null,
            start_date: club.start_date ?? null,
            end_date: club.end_date ?? null,
          } as any,
        ];
        await club.save();
        n++;
      }
    }
  }
  console.log(`Migrated ${n} clubs`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});