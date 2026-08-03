import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/src/env";

interface Check {
  name: string;
  passed: boolean;
  detail: string;
  required: boolean;
}

const env = getEnv();
const checks: Check[] = [];
function check(name: string, passed: boolean, detail: string, required = true): void {
  checks.push({ name, passed, detail, required });
}

check("APP_MODE", env.APP_MODE === "evaluation", `configured as ${env.APP_MODE}`);
check("APP_URL HTTPS", env.APP_URL.startsWith("https://"), env.APP_URL);
check(
  "MASTER_KEY",
  env.MASTER_KEY.length >= 32 && !env.MASTER_KEY.includes("development-only"),
  "strong non-default value",
);
check(
  "SESSION_SECRET",
  env.SESSION_SECRET.length >= 32 && !env.SESSION_SECRET.includes("development-only"),
  "strong non-default value",
);
check(
  "Slack app credentials",
  Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_SIGNING_SECRET),
  "client ID, client secret, and signing secret",
);
check(
  "Google OAuth credentials",
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  "web client ID and secret",
);
check(
  "OpenRouter live eval key",
  Boolean(env.OPENROUTER_API_KEY),
  env.OPENROUTER_API_KEY
    ? "available to CLI evals"
    : "optional for app setup; required in .env for npm run eval:live",
  false,
);
const cloudflared = spawnSync("cloudflared", ["--version"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const cloudflaredReady = cloudflared.status === 0;
const cloudflaredDetail = cloudflaredReady
  ? (cloudflared.stdout.trim().split("\n")[0] ?? "installed")
  : "not installed";
check("cloudflared", cloudflaredReady, cloudflaredDetail);
try {
  await fs.mkdir(path.dirname(path.resolve(env.DATABASE_PATH)), { recursive: true });
  await fs.access(path.dirname(path.resolve(env.DATABASE_PATH)), fs.constants.W_OK);
  check("SQLite directory", true, path.dirname(path.resolve(env.DATABASE_PATH)));
} catch {
  check("SQLite directory", false, "directory is not writable");
}

function resultLabel(item: Check): "PASS" | "FAIL" | "OPTIONAL" {
  if (item.passed) return "PASS";
  return item.required ? "FAIL" : "OPTIONAL";
}

console.table(
  checks.map((item) => ({
    check: item.name,
    result: resultLabel(item),
    detail: item.detail,
  })),
);
console.log(`Slack OAuth redirect: ${env.APP_URL}/api/slack/oauth/callback`);
console.log(`Slack interactivity: ${env.APP_URL}/api/slack/interactions`);
console.log(`Google OAuth redirect: ${env.APP_URL}/api/google/oauth/callback`);

if (checks.some((item) => item.required && !item.passed)) process.exitCode = 1;
