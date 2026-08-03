import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getEnv } from "@/src/env";
import * as schema from "./schema";

let singleton: ReturnType<typeof createDatabase> | undefined;

export function createDatabase(databasePath = getEnv().DATABASE_PATH) {
  if (databasePath !== ":memory:")
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export function getDatabase() {
  singleton ??= createDatabase();
  return singleton;
}

export function closeDatabase(): void {
  singleton?.sqlite.close();
  singleton = undefined;
}
