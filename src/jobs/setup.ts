import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabase } from "@/src/db/client";
import { listAllInstallations } from "@/src/db/repositories";
import { getEnv } from "@/src/env";
import { seedDemo } from "@/src/demo/seed";
import { assertInstallationPolicy, isDemoMode } from "@/src/runtime/policy";

let ready = false;
export function ensureSetup(): void {
  if (ready) return;
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
  if (isDemoMode()) seedDemo();
  assertInstallationPolicy(listAllInstallations(), getEnv().APP_MODE);
  ready = true;
}
