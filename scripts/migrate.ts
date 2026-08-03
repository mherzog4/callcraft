import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDatabase, closeDatabase } from "@/src/db/client";

migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
closeDatabase();
console.log("Database migrations applied");
