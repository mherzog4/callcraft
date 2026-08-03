import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachSeededGong } from "@/src/demo/seed";
import { closeDatabase, getDatabase } from "@/src/db/client";
import {
  getCredential,
  getInstallation,
  listCalls,
  listInstallations,
  listJobs,
  resetSyntheticData,
  saveCredential,
  saveDraft,
  saveSlackDelivery,
  saveSummary,
  upsertCall,
  upsertInstallation,
  upsertSeller,
} from "@/src/db/repositories";
import { resetEnvForTests } from "@/src/env";
import { demoCalls } from "@/src/integrations/gong/fixtures";
import { queueConfirmedSend, scheduleRecurringJobs } from "@/src/jobs/worker";

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-evaluation-")),
    "test.db",
  );
  process.env.APP_MODE = "evaluation";
  delete process.env.DEMO_MODE;
  process.env.MASTER_KEY = "evaluation-master-key-that-is-at-least-32-characters";
  process.env.SESSION_SECRET = "evaluation-session-secret-that-is-at-least-32-characters";
  resetEnvForTests();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
});

afterEach(() => {
  closeDatabase();
  delete process.env.APP_MODE;
  resetEnvForTests();
});

describe("evaluation workflow setup", () => {
  it("does not schedule seeded discovery before Slack and OpenRouter are ready", () => {
    const seller = upsertSeller({ email: "evaluator@example.test", displayName: "Evaluator" });
    attachSeededGong(seller.id);
    expect(scheduleRecurringJobs(new Date("2026-08-03T00:00:00Z"))).toBe(0);
    expect(listJobs(10, seller.id)).toHaveLength(0);

    upsertInstallation({ sellerId: seller.id, provider: "slack", mode: "real" });
    const openrouter = upsertInstallation({
      sellerId: seller.id,
      provider: "openrouter",
      mode: "real",
    });
    saveCredential({ installationId: openrouter.id, secretEncrypted: "encrypted-test-value" });

    expect(scheduleRecurringJobs(new Date("2026-08-03T00:00:00Z"))).toBe(2);
    expect(
      listJobs(10, seller.id)
        .map((job) => job.type)
        .sort(),
    ).toEqual(["cleanup", "discover_calls"]);
  });

  it("blocks real Gmail confirmation while a reserved fixture recipient remains", () => {
    const seller = upsertSeller({ email: "evaluator@example.test", displayName: "Evaluator" });
    const gong = attachSeededGong(seller.id);
    upsertInstallation({ sellerId: seller.id, provider: "slack", mode: "real" });
    upsertInstallation({ sellerId: seller.id, provider: "openrouter", mode: "real" });
    upsertInstallation({
      sellerId: seller.id,
      provider: "google",
      mode: "real",
      externalAccountId: "evaluator@gmail.com",
    });
    const call = upsertCall(gong.id, seller.id, { ...demoCalls[0]!, providerRequestId: null });
    const summary = saveSummary(
      call.id,
      {
        participants: [],
        pains: [],
        decisions: [],
        objections: [],
        commitments: [],
        nextSteps: [],
        evidence: [{ claim: "Synthetic call occurred", segmentIds: ["segment-1"] }],
        uncertainty: [],
      },
      "test/model",
    );
    const draft = saveDraft(call.id, summary.id, {
      to: ["jordan.lee@example.org"],
      cc: [],
      subject: "Synthetic follow-up",
      body: "Test body",
    });

    expect(() =>
      queueConfirmedSend({
        draftId: draft.id,
        sellerId: seller.id,
        sender: "evaluator@gmail.com",
      }),
    ).toThrow("Replace reserved example-domain recipients");
  });

  it("resets synthetic data without disconnecting real OAuth installations", () => {
    const seller = upsertSeller({ email: "evaluator@example.test", displayName: "Evaluator" });
    const gong = attachSeededGong(seller.id);
    const slack = upsertInstallation({
      sellerId: seller.id,
      provider: "slack",
      mode: "real",
      externalAccountId: "U123",
    });
    const google = upsertInstallation({
      sellerId: seller.id,
      provider: "google",
      mode: "real",
      externalAccountId: "evaluator@gmail.com",
    });
    upsertInstallation({ sellerId: seller.id, provider: "openrouter", mode: "real" });
    saveCredential({ installationId: slack.id, accessTokenEncrypted: "slack-ciphertext" });
    saveCredential({ installationId: google.id, refreshTokenEncrypted: "google-ciphertext" });
    const call = upsertCall(gong.id, seller.id, { ...demoCalls[0]!, providerRequestId: null });
    const summary = saveSummary(
      call.id,
      {
        participants: [],
        pains: [],
        decisions: [],
        objections: [],
        commitments: [],
        nextSteps: [],
        evidence: [{ claim: "Synthetic call occurred", segmentIds: ["segment-1"] }],
        uncertainty: [],
      },
      "test/model",
    );
    const draft = saveDraft(call.id, summary.id, {
      to: ["recipient@evaluator.test"],
      cc: [],
      subject: "Synthetic follow-up",
      body: "Test body",
    });
    saveSlackDelivery(draft.id, {
      status: "delivered",
      channelId: "D123",
      messageTs: "123.456",
    });
    queueConfirmedSend({
      draftId: draft.id,
      sellerId: seller.id,
      sender: "evaluator@gmail.com",
    });

    resetSyntheticData(seller.id);

    expect(listCalls(seller.id)).toHaveLength(0);
    expect(listInstallations(seller.id)).toHaveLength(4);
    expect(getInstallation(seller.id, "slack")?.status).toBe("connected");
    expect(getInstallation(seller.id, "google")?.status).toBe("connected");
    expect(getCredential(slack.id)?.accessTokenEncrypted).toBe("slack-ciphertext");
    expect(getCredential(google.id)?.refreshTokenEncrypted).toBe("google-ciphertext");
  });
});
