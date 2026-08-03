import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { closeDatabase, getDatabase } from "@/src/db/client";
import { resetDemoData } from "@/src/db/repositories";
import { DEMO_SELLER_ID, seedDemo } from "@/src/demo/seed";

migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
resetDemoData(DEMO_SELLER_ID);
seedDemo();
closeDatabase();
console.log("Demo reset complete");
