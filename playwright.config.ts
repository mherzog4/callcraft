import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry" },
  webServer: {
    command:
      "rm -f ./data/e2e.db ./data/e2e.db-shm ./data/e2e.db-wal && npx tsx scripts/migrate.ts && npx tsx scripts/seed.ts && npx tsx scripts/worker.ts && npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      ...process.env,
      APP_MODE: "demo",
      APP_URL: "http://127.0.0.1:3100",
      DATABASE_PATH: "./data/e2e.db",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
