import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { closeDatabase, getDatabase } from "@/src/db/client";
import { seedDemo } from "@/src/demo/seed";

migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
const seller = seedDemo();
console.log(`Seeded demo seller ${seller.id}`);
closeDatabase();
