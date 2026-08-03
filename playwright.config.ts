import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: {
    command:
      "rm -f ./data/e2e.db ./data/e2e.db-shm ./data/e2e.db-wal && npm run db:migrate && npm run db:seed && npm run worker && npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, DEMO_MODE: "true", DATABASE_PATH: "./data/e2e.db" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
