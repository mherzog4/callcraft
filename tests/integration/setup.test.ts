import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/setup/route";
import { closeDatabase, getDatabase } from "@/src/db/client";
import {
  getCredential,
  getInstallation,
  getSeller,
  listJobs,
  saveCredential,
  upsertInstallation,
  upsertSeller,
} from "@/src/db/repositories";
import { resetEnvForTests } from "@/src/env";
import { encryptSecret } from "@/src/security/crypto";
import { createSession } from "@/src/security/session";

const masterKey = "test-master-key-that-is-at-least-32-characters";
const sessionSecret = "test-session-secret-that-is-at-least-32-characters";

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-setup-")),
    "test.db",
  );
  delete process.env.APP_MODE;
  process.env.DEMO_MODE = "false";
  process.env.APP_URL = "http://localhost:3000";
  process.env.MASTER_KEY = masterKey;
  process.env.SESSION_SECRET = sessionSecret;
  process.env.OPENROUTER_MODEL = "old/model";
  resetEnvForTests();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
});
afterEach(() => closeDatabase());

describe("provider settings", () => {
  it("creates only seeded Gong and real OpenRouter for an evaluation seller", async () => {
    process.env.APP_MODE = "evaluation";
    delete process.env.DEMO_MODE;
    resetEnvForTests();
    const seller = upsertSeller({ email: "evaluator@example.test", displayName: "Evaluator" });
    upsertInstallation({
      sellerId: seller.id,
      provider: "slack",
      mode: "real",
      externalAccountId: "U-EVALUATOR",
    });

    const form = new FormData();
    form.set("displayName", "Evaluator");
    form.set("email", "evaluator@example.test");
    form.set("tone", "warm");
    form.set("length", "medium");
    form.set("signature", "Evaluator");
    form.set("retentionMode", "days");
    form.set("retentionDays", "7");
    form.set("openrouterApiKey", "evaluation-router-key");
    form.set("openrouterModel", "openai/gpt-4.1-mini");
    const response = await POST(
      new Request("http://localhost:3000/api/setup", {
        method: "POST",
        body: form,
        headers: {
          origin: "http://localhost:3000",
          cookie: `session=${createSession(seller.id, sessionSecret)}`,
        },
      }),
    );

    expect(response.status).toBe(303);
    expect(getInstallation(seller.id, "gong")).toMatchObject({
      mode: "demo",
      status: "connected",
      externalAccountId: "gong-user-alex",
    });
    expect(getInstallation(seller.id, "openrouter")).toMatchObject({
      mode: "real",
      status: "connected",
    });
    expect(
      getCredential(getInstallation(seller.id, "openrouter")!.id)?.secretEncrypted,
    ).toBeTruthy();
    expect(getInstallation(seller.id, "google")).toBeUndefined();
    expect(listJobs(10, seller.id)).toHaveLength(0);
  });

  it("updates selected Gong identity and OpenRouter model without resupplying secrets", async () => {
    const seller = upsertSeller({
      email: "seller@example.org",
      displayName: "Seller",
      preferences: {
        tone: "warm",
        length: "medium",
        signature: "Seller",
        retentionMode: "days",
        retentionDays: 7,
      },
    });
    const gong = upsertInstallation({
      sellerId: seller.id,
      provider: "gong",
      mode: "real",
      externalAccountId: "old-user",
      metadata: { baseUrlHost: "api.gong.io" },
    });
    const openrouter = upsertInstallation({
      sellerId: seller.id,
      provider: "openrouter",
      mode: "real",
      metadata: { model: "old/model" },
    });
    const gongCiphertext = encryptSecret(
      JSON.stringify({
        baseUrl: "https://api.gong.io",
        accessKey: "key",
        accessSecret: "secret",
      }),
      masterKey,
    );
    const openrouterCiphertext = encryptSecret(JSON.stringify({ apiKey: "router-key" }), masterKey);
    saveCredential({ installationId: gong.id, secretEncrypted: gongCiphertext });
    saveCredential({ installationId: openrouter.id, secretEncrypted: openrouterCiphertext });

    const form = new FormData();
    form.set("displayName", "Seller");
    form.set("email", "seller@example.org");
    form.set("tone", "warm");
    form.set("length", "medium");
    form.set("signature", "Seller");
    form.set("retentionMode", "days");
    form.set("retentionDays", "7");
    form.set("gongUserId", "selected-user");
    form.set("openrouterModel", "new/model");
    const response = await POST(
      new Request("http://localhost:3000/api/setup", {
        method: "POST",
        body: form,
        headers: {
          origin: "http://localhost:3000",
          cookie: `session=${createSession(seller.id, sessionSecret)}`,
        },
      }),
    );
    expect(response.status).toBe(303);
    expect(getSeller(seller.id)?.gongUserId).toBe("selected-user");
    expect(getInstallation(seller.id, "gong")?.externalAccountId).toBe("selected-user");
    expect(getInstallation(seller.id, "openrouter")!.metadataJson).toContain('"model":"new/model"');
    expect(getCredential(gong.id)?.secretEncrypted).toBe(gongCiphertext);
    expect(getCredential(openrouter.id)?.secretEncrypted).toBe(openrouterCiphertext);
  });
});
