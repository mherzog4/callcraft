import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/client";
import {
  claimJob,
  enqueueJob,
  failJob,
  reschedulePendingTranscript,
  reviveDeadJob,
} from "@/src/db/repositories";
import { resetEnvForTests } from "@/src/env";

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-db-")),
    "test.db",
  );
  process.env.DEMO_MODE = "true";
  resetEnvForTests();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
});
afterEach(() => closeDatabase());
describe("SQLite repository", () => {
  it("enables WAL, foreign keys, unique job idempotency, and atomic claims", () => {
    const sqlite = getDatabase().sqlite;
    expect(sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    const first = enqueueJob("cleanup", "cleanup:today", {});
    const duplicate = enqueueJob("cleanup", "cleanup:today", {});
    expect(duplicate.id).toBe(first.id);
    expect(claimJob("worker-a")?.id).toBe(first.id);
    expect(claimJob("worker-b")).toBeUndefined();
    sqlite
      .prepare("UPDATE jobs SET locked_at = ? WHERE id = ?")
      .run(Date.now() - 10 * 60_000, first.id);
    const reclaimed = claimJob("worker-b");
    expect(reclaimed?.id).toBe(first.id);
    expect(reclaimed?.attempts).toBe(2);
  });
  it("does not spend terminal attempts while a transcript is pending and can revive dead work", () => {
    const sqlite = getDatabase().sqlite;
    const job = enqueueJob("fetch_call", "fetch:pending", {}, new Date(), 2);
    for (let index = 0; index < 8; index += 1) {
      const claimed = claimJob(`worker-${index}`);
      expect(claimed?.id).toBe(job.id);
      reschedulePendingTranscript(job.id, "not ready", 60_000);
      const row = sqlite.prepare("SELECT status, attempts FROM jobs WHERE id = ?").get(job.id) as {
        status: string;
        attempts: number;
      };
      expect(row).toEqual({ status: "retry_wait", attempts: 0 });
      sqlite.prepare("UPDATE jobs SET run_after = 0 WHERE id = ?").run(job.id);
    }
    sqlite
      .prepare("UPDATE jobs SET attempts = max_attempts, status = 'running' WHERE id = ?")
      .run(job.id);
    expect(failJob(job.id, "provider", "terminal")).toBe("dead_letter");
    expect(reviveDeadJob(job.id)).toBe(true);
    const revived = sqlite
      .prepare("SELECT status, attempts FROM jobs WHERE id = ?")
      .get(job.id) as {
      status: string;
      attempts: number;
    };
    expect(revived).toEqual({ status: "pending", attempts: 0 });
  });
});
