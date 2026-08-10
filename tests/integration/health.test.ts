import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/client";
import { createSendIntent, listDrafts } from "@/src/db/repositories";
import { seedDemo } from "@/src/demo/seed";
import { resetEnvForTests } from "@/src/env";
import { resetDemoGong } from "@/src/integrations/gong";
import { runWorkerUntilIdle } from "@/src/jobs/worker";
import { readHealth } from "@/src/ops/health";

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-health-")),
    "test.db",
  );
  process.env.DEMO_MODE = "true";
  resetEnvForTests();
  resetDemoGong();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
  seedDemo();
});
afterEach(() => closeDatabase());

describe("operational health signals", () => {
  it("reports ok once the queue has drained", async () => {
    await runWorkerUntilIdle(50);
    const health = readHealth();
    expect(health.status).toBe("ok");
    expect(health.degradedReasons).toEqual([]);
    expect(health.databaseBytes).toBeGreaterThan(0);
  });

  it("degrades on dead letters", async () => {
    await runWorkerUntilIdle(50);
    getDatabase()
      .sqlite.prepare("UPDATE jobs SET status = 'dead_letter' WHERE id = (SELECT id FROM jobs)")
      .run();
    const health = readHealth();
    expect(health.status).toBe("degraded");
    expect(health.deadLetters).toBe(1);
    expect(health.degradedReasons).toContain("dead_letter_jobs");
  });

  // The failure this exists for: the web process is healthy, nothing is in
  // dead_letter, and the worker is simply not running. Before this signal the
  // endpoint reported "ok" through a total processing outage.
  it("degrades when due jobs are not being drained", async () => {
    await runWorkerUntilIdle(50);
    const stalledAt = Date.now() - 3_600_000;
    getDatabase()
      .sqlite.prepare(
        "UPDATE jobs SET status = 'pending', run_after = ? WHERE id = (SELECT id FROM jobs)",
      )
      .run(stalledAt);
    const health = readHealth();
    expect(health.status).toBe("degraded");
    expect(health.oldestDueJobSeconds).toBeGreaterThan(3000);
    expect(health.degradedReasons).toContain("queue_not_draining");
  });

  it("degrades while a send intent still needs manual reconciliation", async () => {
    await runWorkerUntilIdle(50);
    const draft = listDrafts("demo-seller")[0]!;
    const intent = createSendIntent({
      draftRevisionId: draft.draft.id,
      sellerId: "demo-seller",
      sender: "seller@example.com",
      draft: {
        to: ["jordan.lee@example.org"],
        cc: [],
        subject: draft.draft.subject,
        body: draft.draft.body,
      },
    });
    getDatabase()
      .sqlite.prepare("UPDATE email_send_intents SET status = 'unknown' WHERE id = ?")
      .run(intent.id);
    const health = readHealth();
    expect(health.status).toBe("degraded");
    expect(health.unresolvedSends).toBe(1);
    expect(health.degradedReasons).toContain("unresolved_send_intents");
  });
});
