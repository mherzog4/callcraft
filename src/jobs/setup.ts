import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabase } from "@/src/db/client";
import { getEnv } from "@/src/env";
import { seedDemo } from "@/src/demo/seed";

let ready = false;
export function ensureSetup(): void {
  if (ready) return;
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
  if (getEnv().DEMO_MODE) seedDemo();
  ready = true;
}
