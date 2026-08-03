import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { closeDatabase, getDatabase } from "@/src/db/client";
import { runWorkerUntilIdle, scheduleRecurringJobs } from "@/src/jobs/worker";

migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
const continuous = process.argv.includes("--watch");
do {
  scheduleRecurringJobs();
  const count = await runWorkerUntilIdle();
  if (!continuous) {
    console.log(`Processed ${count} job(s)`);
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, count ? 100 : 3000));
} while (continuous);
closeDatabase();
