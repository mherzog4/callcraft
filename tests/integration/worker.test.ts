import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, getDatabase } from "@/src/db/client";
import { seedDemo } from "@/src/demo/seed";
import {
  createSendIntent,
  enqueueJob,
  getCall,
  getInstallation,
  getSegments,
  getSeller,
  getSendIntent,
  listCalls,
  listDrafts,
  listJobs,
  saveDraft,
  saveSummary,
  updateSeller,
  upsertCall,
} from "@/src/db/repositories";
import { resetEnvForTests } from "@/src/env";
import { resetDemoGong } from "@/src/integrations/gong";
import { recordEmailSendFailure, runWorkerOnce, runWorkerUntilIdle } from "@/src/jobs/worker";
import { EmailSendError } from "@/src/integrations/email/types";
import { demoCalls } from "@/src/integrations/gong/fixtures";

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error("Test fixture JSON is malformed", { cause: error });
  }
}

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-worker-")),
    "test.db",
  );
  process.env.DEMO_MODE = "true";
  resetEnvForTests();
  resetDemoGong();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
  seedDemo();
});
afterEach(() => closeDatabase());
describe("automatic worker recovery", () => {
  it("generates and delivers ready calls exactly once while pending calls wait", async () => {
    const count = await runWorkerUntilIdle(50);
    expect(count).toBeGreaterThan(4);
    const calls = listCalls("demo-seller");
    expect(calls.some((call) => call.state === "delivered")).toBe(true);
    expect(calls.some((call) => call.state === "awaiting_transcript")).toBe(true);
    expect(listDrafts("demo-seller")).toHaveLength(1);
    const pending = listJobs().filter(
      (job) => job.type === "fetch_call" && job.status === "retry_wait",
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]!.attempts).toBe(0);
    getDatabase().sqlite.prepare("UPDATE jobs SET run_after = 0 WHERE id = ?").run(pending[0]!.id);
    await runWorkerUntilIdle(50);
    expect(listDrafts("demo-seller")).toHaveLength(2);
    expect(listCalls("demo-seller").every((call) => call.state === "delivered")).toBe(true);
  });
  it("marks the call dead-letter when a job exhausts its attempts", async () => {
    const sqlite = getDatabase().sqlite;
    sqlite.prepare("DELETE FROM jobs").run();
    const gong = getInstallation("demo-seller", "gong")!;
    const call = upsertCall(gong.id, "demo-seller", {
      ...demoCalls[0]!,
      providerRequestId: null,
    });
    enqueueJob(
      "compose_draft",
      "terminal-compose",
      { callId: call.id, sellerId: "demo-seller" },
      new Date(),
      1,
    );
    await runWorkerOnce("terminal-worker");
    expect(getCall(call.id)?.state).toBe("dead_letter");
    expect(listJobs()[0]?.status).toBe("dead_letter");
  });
  it("deletes delivered transcripts immediately for after-delivery retention", async () => {
    const seller = getSeller("demo-seller")!;
    updateSeller(seller.id, {
      preferencesJson: JSON.stringify({
        tone: "warm",
        length: "medium",
        signature: "Alex",
        retentionMode: "after_delivery",
        retentionDays: 365,
      }),
    });
    await runWorkerUntilIdle(50);
    const delivered = listCalls(seller.id).find((call) => call.state === "delivered")!;
    expect(getSegments(delivered.id).length).toBeGreaterThan(0);
    enqueueJob("cleanup", "cleanup:immediate-test", { sellerId: seller.id });
    await runWorkerUntilIdle(10);
    expect(getSegments(delivered.id)).toEqual([]);
  });
  it("marks Gmail authorization for reconnect while preserving ambiguous outcomes", async () => {
    await runWorkerUntilIdle(50);
    const draft = listDrafts("demo-seller")[0]!.draft;
    const failed = createSendIntent({
      draftRevisionId: draft.id,
      sellerId: "demo-seller",
      sender: "alex@example.org",
      draft: {
        to: parseJson(draft.toJson) as string[],
        cc: parseJson(draft.ccJson) as string[],
        subject: draft.subject,
        body: draft.body,
      },
    });
    recordEmailSendFailure(failed.id, new EmailSendError("revoked", "auth", false));
    expect(getSendIntent(failed.id)?.status).toBe("failed");
    const refreshedGoogle = getInstallation("demo-seller", "google")!;
    expect(refreshedGoogle.status).toBe("error");
    expect(parseJson(refreshedGoogle.metadataJson)).toMatchObject({ reconnectRequired: true });

    const summary = saveSummary(
      draft.callId,
      {
        participants: [],
        pains: [],
        decisions: [],
        objections: [],
        commitments: [],
        nextSteps: [],
        evidence: [{ claim: "Call occurred", segmentIds: ["segment"] }],
        uncertainty: [],
      },
      "test",
    );
    const secondDraft = saveDraft(draft.callId, summary.id, {
      to: ["buyer@example.org"],
      cc: [],
      subject: "Second",
      body: "Body",
    });
    const ambiguous = createSendIntent({
      draftRevisionId: secondDraft.id,
      sellerId: "demo-seller",
      sender: "alex@example.org",
      draft: { to: ["buyer@example.org"], cc: [], subject: "Second", body: "Body" },
    });
    recordEmailSendFailure(ambiguous.id, new Error("socket closed"));
    expect(getSendIntent(ambiguous.id)?.status).toBe("unknown");
  });
});
