import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({
  extract: vi.fn(),
  compose: vi.fn(),
  slackDeliver: vi.fn(),
  gmailSend: vi.fn(),
}));

vi.mock("@/src/integrations/openrouter/client", () => ({
  OpenRouterGenerator: class {
    extract = providers.extract;
    compose = providers.compose;
  },
}));

vi.mock("@/src/integrations/slack/client", () => ({
  SlackDestination: class {
    deliver = providers.slackDeliver;
  },
  PreviewSlackDestination: class {
    deliver() {
      throw new Error("Preview Slack must not be used in evaluation mode");
    }
  },
}));

vi.mock("@/src/integrations/email", () => ({
  GmailSender: class {
    send = providers.gmailSend;
  },
  PreviewEmailSender: class {
    send() {
      throw new Error("Preview email must not be used in evaluation mode");
    }
  },
}));

import { attachSeededGong } from "@/src/demo/seed";
import { verifyLiveAcceptance } from "@/src/evals/acceptance";
import { closeDatabase, getDatabase } from "@/src/db/client";
import {
  enqueueJob,
  getSendIntent,
  listCalls,
  listDrafts,
  listJobs,
  saveCredential,
  upsertInstallation,
  upsertSeller,
} from "@/src/db/repositories";
import { resetEnvForTests } from "@/src/env";
import { demoSegments } from "@/src/integrations/gong/fixtures";
import { queueConfirmedSend, runWorkerUntilIdle } from "@/src/jobs/worker";
import { encryptSecret } from "@/src/security/crypto";

const masterKey = "evaluation-worker-master-key-at-least-32-characters";

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-evaluation-worker-")),
    "test.db",
  );
  process.env.APP_MODE = "evaluation";
  delete process.env.DEMO_MODE;
  process.env.MASTER_KEY = masterKey;
  process.env.SESSION_SECRET = "evaluation-worker-session-key-at-least-32-characters";
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  resetEnvForTests();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
  providers.extract.mockReset().mockResolvedValue({
    value: {
      participants: [],
      pains: ["Follow-up takes time"],
      decisions: [],
      objections: [],
      commitments: [],
      nextSteps: ["Send the security packet"],
      evidence: [{ claim: "Send the security packet", segmentIds: [demoSegments[3]!.id] }],
      uncertainty: [],
    },
    modelId: "test/real-model",
    usage: { totalTokens: 10 },
  });
  providers.compose.mockReset().mockResolvedValue({
    value: {
      to: ["recipient@evaluator.test"],
      cc: [],
      subject: "Follow-up",
      body: "Thanks for the synthetic evaluation call.",
    },
    modelId: "test/real-model",
    usage: { totalTokens: 5 },
  });
  providers.slackDeliver.mockReset().mockResolvedValue({ channelId: "D123", messageTs: "1.2" });
  providers.gmailSend.mockReset().mockResolvedValue({
    messageId: "gmail-message-1",
    threadId: "gmail-thread-1",
    acceptedAt: new Date("2026-08-03T00:00:00Z"),
  });
});

afterEach(() => {
  closeDatabase();
  delete process.env.APP_MODE;
  resetEnvForTests();
});

function seedEvaluationSeller() {
  const seller = upsertSeller({ email: "evaluator@example.test", displayName: "Evaluator" });
  const gong = attachSeededGong(seller.id);
  const openrouter = upsertInstallation({
    sellerId: seller.id,
    provider: "openrouter",
    mode: "real",
  });
  saveCredential({
    installationId: openrouter.id,
    secretEncrypted: encryptSecret(JSON.stringify({ apiKey: "real-test-key" }), masterKey),
  });
  const slack = upsertInstallation({
    sellerId: seller.id,
    provider: "slack",
    mode: "real",
    externalAccountId: "U123",
  });
  saveCredential({
    installationId: slack.id,
    accessTokenEncrypted: encryptSecret("xoxb-real-test", masterKey),
  });
  return { seller, gong };
}

describe("evaluation worker provider mix", () => {
  it("uses seeded Gong with real-mode OpenRouter, Slack, and Gmail adapters", async () => {
    const { seller, gong } = seedEvaluationSeller();
    enqueueJob("discover_calls", "evaluation-discovery", {
      sellerId: seller.id,
      installationId: gong.id,
    });
    await runWorkerUntilIdle(50);

    expect(providers.extract).toHaveBeenCalled();
    expect(providers.compose).toHaveBeenCalled();
    expect(providers.slackDeliver).toHaveBeenCalled();
    expect(listDrafts(seller.id)).toHaveLength(1);
    expect(listCalls(seller.id).some((call) => call.state === "delivered")).toBe(true);

    const google = upsertInstallation({
      sellerId: seller.id,
      provider: "google",
      mode: "real",
      externalAccountId: "evaluator@gmail.com",
    });
    saveCredential({
      installationId: google.id,
      refreshTokenEncrypted: encryptSecret("google-refresh", masterKey),
    });
    const draft = listDrafts(seller.id)[0]!.draft;
    const intentId = queueConfirmedSend({
      draftId: draft.id,
      sellerId: seller.id,
      sender: "evaluator@gmail.com",
    });
    await runWorkerUntilIdle(20);

    expect(providers.gmailSend).toHaveBeenCalledOnce();
    expect(getSendIntent(intentId)).toMatchObject({
      status: "submitted",
      gmailMessageId: "gmail-message-1",
    });
    expect(verifyLiveAcceptance()).toMatchObject({ passed: true });
  });

  it("records a real generation failure instead of using preview generation", async () => {
    providers.extract.mockRejectedValueOnce(new Error("OpenRouter unavailable"));
    const { seller, gong } = seedEvaluationSeller();
    enqueueJob("discover_calls", "evaluation-failure", {
      sellerId: seller.id,
      installationId: gong.id,
    });
    await runWorkerUntilIdle(30);

    expect(providers.extract).toHaveBeenCalled();
    expect(providers.compose).not.toHaveBeenCalled();
    expect(providers.slackDeliver).not.toHaveBeenCalled();
    expect(listDrafts(seller.id)).toHaveLength(0);
    expect(listJobs(50, seller.id).some((job) => job.status === "retry_wait")).toBe(true);
  });
});
