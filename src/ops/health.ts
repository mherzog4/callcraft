import { and, count, eq, inArray, lt, min } from "drizzle-orm";
import { statSync } from "node:fs";
import { getDatabase } from "@/src/db/client";
import { emailSendIntents, installations, jobs } from "@/src/db/schema";
import { getEnv } from "@/src/env";

// A job that is due but still pending means the worker is not draining the
// queue. Below this the reading is indistinguishable from normal scheduling.
const STALLED_QUEUE_SECONDS = 300;

export type HealthSnapshot = {
  status: "ok" | "degraded";
  deadLetters: number;
  unresolvedSends: number;
  providersNeedingAttention: number;
  oldestDueJobSeconds: number;
  databaseBytes: number;
  degradedReasons: string[];
};

function scalar(rows: { value: number | null }[]): number {
  return rows[0]?.value ?? 0;
}

function databaseBytes(): number {
  try {
    return statSync(getEnv().DATABASE_PATH).size;
  } catch {
    // The file is absent only before the first migration; report 0 rather
    // than failing the health check the deploy gate depends on.
    return 0;
  }
}

export function readHealth(now = new Date()): HealthSnapshot {
  const { db } = getDatabase();

  const deadLetters = scalar(
    db.select({ value: count() }).from(jobs).where(eq(jobs.status, "dead_letter")).all(),
  );

  // `unknown` disables automatic retry and requires manual Gmail
  // reconciliation; `submitting` past a crash is the same situation before
  // anyone has looked. Both need a human, so both surface here.
  const unresolvedSends = scalar(
    db
      .select({ value: count() })
      .from(emailSendIntents)
      .where(inArray(emailSendIntents.status, ["unknown", "submitting"]))
      .all(),
  );

  const providersNeedingAttention = scalar(
    db
      .select({ value: count() })
      .from(installations)
      .where(eq(installations.status, "error"))
      .all(),
  );

  const oldestDue = db
    .select({ value: min(jobs.runAfter) })
    .from(jobs)
    .where(and(eq(jobs.status, "pending"), lt(jobs.runAfter, now)))
    .all();
  const oldestDueMs = oldestDue[0]?.value ?? null;
  const oldestDueSeconds = oldestDueMs
    ? Math.max(0, Math.round((now.getTime() - new Date(oldestDueMs).getTime()) / 1000))
    : 0;

  const degradedReasons: string[] = [];
  if (deadLetters > 0) degradedReasons.push("dead_letter_jobs");
  if (unresolvedSends > 0) degradedReasons.push("unresolved_send_intents");
  if (providersNeedingAttention > 0) degradedReasons.push("provider_reconnect_required");
  if (oldestDueSeconds > STALLED_QUEUE_SECONDS) degradedReasons.push("queue_not_draining");

  return {
    status: degradedReasons.length > 0 ? "degraded" : "ok",
    deadLetters,
    unresolvedSends,
    providersNeedingAttention,
    oldestDueJobSeconds: oldestDueSeconds,
    databaseBytes: databaseBytes(),
    degradedReasons,
  };
}
