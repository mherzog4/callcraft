import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as googleCallback } from "@/app/api/google/oauth/callback/route";
import { GET as googleStart } from "@/app/api/google/oauth/start/route";
import { POST as slackInteractions } from "@/app/api/slack/interactions/route";
import { GET as slackCallback } from "@/app/api/slack/oauth/callback/route";
import { GET as slackStart } from "@/app/api/slack/oauth/start/route";
import { closeDatabase, getDatabase } from "@/src/db/client";
import { upsertSeller } from "@/src/db/repositories";
import { resetEnvForTests } from "@/src/env";
import { createSession } from "@/src/security/session";

const sessionSecret = "oauth-session-secret-that-is-at-least-32-characters";

beforeEach(async () => {
  closeDatabase();
  process.env.DATABASE_PATH = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-oauth-")),
    "test.db",
  );
  process.env.APP_MODE = "evaluation";
  delete process.env.DEMO_MODE;
  process.env.APP_URL = "https://temporary-tunnel.example.test";
  process.env.MASTER_KEY = "oauth-master-key-that-is-at-least-32-characters";
  process.env.SESSION_SECRET = sessionSecret;
  process.env.SLACK_CLIENT_ID = "slack-client";
  process.env.SLACK_CLIENT_SECRET = "slack-secret";
  process.env.SLACK_SIGNING_SECRET = "slack-signing-secret";
  process.env.GOOGLE_CLIENT_ID = "google-client";
  process.env.GOOGLE_CLIENT_SECRET = "google-secret";
  resetEnvForTests();
  migrate(getDatabase().db, { migrationsFolder: "./drizzle" });
});

afterEach(() => {
  closeDatabase();
  delete process.env.APP_MODE;
  resetEnvForTests();
});

describe("evaluation OAuth and Slack routes", () => {
  it("permits Slack OAuth bootstrap and reaches callback state validation", async () => {
    const start = slackStart(
      new Request("https://temporary-tunnel.example.test/api/slack/oauth/start"),
    );
    expect(start.status).toBe(307);
    expect(start.headers.get("location")).toContain("https://slack.com/oauth/v2/authorize");

    const callback = await slackCallback(
      new Request("https://temporary-tunnel.example.test/api/slack/oauth/callback?state=missing"),
    );
    expect(await callback.text()).toBe("OAuth state mismatch");
  });

  it("permits seller-bound Google OAuth start in evaluation mode", () => {
    const seller = upsertSeller({ email: "evaluator@example.test", displayName: "Evaluator" });
    const request = new Request("https://temporary-tunnel.example.test/api/google/oauth/start", {
      headers: { cookie: `session=${createSession(seller.id, sessionSecret)}` },
    });
    const response = googleStart(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("accounts.google.com");
    expect(response.headers.get("location")).toContain("gmail.send");
  });

  it("runs Slack signature verification instead of rejecting evaluation mode", async () => {
    const response = await slackInteractions(
      new Request("https://temporary-tunnel.example.test/api/slack/interactions", {
        method: "POST",
        body: "payload=%7B%7D",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Invalid Slack signature");
  });

  it("keeps every real OAuth route disabled in demo mode", async () => {
    process.env.APP_MODE = "demo";
    resetEnvForTests();
    const slack = slackStart(
      new Request("https://temporary-tunnel.example.test/api/slack/oauth/start"),
    );
    expect(slack.headers.get("location")).toContain("real_oauth_disabled_in_demo");
    const google = googleStart(
      new Request("https://temporary-tunnel.example.test/api/google/oauth/start"),
    );
    expect(google.headers.get("location")).toContain("real_oauth_disabled_in_demo");
    const callback = await googleCallback(
      new Request("https://temporary-tunnel.example.test/api/google/oauth/callback"),
    );
    expect(await callback.text()).toBe("Real OAuth is disabled in demo mode");
  });
});
