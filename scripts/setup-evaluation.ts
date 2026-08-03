import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { argumentValue } from "@/src/cli/arguments";

function publicAppUrl(value: string | undefined): string {
  if (!value) throw new Error("Pass the current tunnel URL with --app-url https://…");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error("--app-url must be a valid absolute URL", { cause: error });
  }
  if (parsed.protocol !== "https:") throw new Error("Evaluation APP_URL must use HTTPS");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("--app-url must contain only the public origin, without a path or query");
  }
  return parsed.origin;
}

function setEnvValue(lines: string[], name: string, value: string): void {
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  const next = `${name}=${value}`;
  if (index >= 0) lines[index] = next;
  else lines.push(next);
}

function currentValue(lines: string[], name: string): string | undefined {
  return lines.find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1);
}

const appUrl = publicAppUrl(argumentValue("--app-url"));
const envPath = path.join(process.cwd(), ".env");
let lines: string[];
try {
  const existing = await fs.readFile(envPath, "utf8");
  lines = existing.split(/\r?\n/);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  const example = await fs.readFile(path.join(process.cwd(), ".env.example"), "utf8");
  lines = example.split(/\r?\n/);
}
lines = lines.filter((line) => !line.startsWith("DEMO_MODE="));
setEnvValue(lines, "APP_MODE", "evaluation");
setEnvValue(lines, "APP_URL", appUrl);
setEnvValue(lines, "DATABASE_PATH", "./data/evaluation.db");
setEnvValue(lines, "EVAL_REPORT_DIRECTORY", "./data/evals");
setEnvValue(
  lines,
  "OPENROUTER_MODEL",
  currentValue(lines, "OPENROUTER_MODEL") || "openai/gpt-4.1-mini",
);
setEnvValue(
  lines,
  "OPENROUTER_EMBEDDING_MODEL",
  currentValue(lines, "OPENROUTER_EMBEDDING_MODEL") || "openai/text-embedding-3-small",
);
setEnvValue(
  lines,
  "EVAL_MODELS",
  currentValue(lines, "EVAL_MODELS") ||
    "openai/gpt-4.1-mini,anthropic/claude-sonnet-4,google/gemini-2.5-flash",
);
for (const name of ["MASTER_KEY", "SESSION_SECRET"]) {
  const current = currentValue(lines, name);
  if (
    !current ||
    current.startsWith("replace-with") ||
    current.includes("development-only") ||
    process.argv.includes("--rotate-secrets")
  ) {
    setEnvValue(lines, name, randomBytes(48).toString("base64url"));
  }
}
await fs.writeFile(
  envPath,
  `${lines.filter((line, index, all) => line || index < all.length - 1).join("\n")}\n`,
  {
    mode: 0o600,
  },
);
await fs.chmod(envPath, 0o600);

console.log("Evaluation environment prepared without printing secrets.");
console.log(`APP_URL: ${appUrl}`);
console.log(`Slack OAuth redirect: ${appUrl}/api/slack/oauth/callback`);
console.log(`Slack interactivity: ${appUrl}/api/slack/interactions`);
console.log(`Google OAuth redirect: ${appUrl}/api/google/oauth/callback`);
console.log("Next: add provider client IDs/secrets to .env, then run npm run evaluation:doctor.");
