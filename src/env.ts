import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_PATH: z.string().min(1).default("./data/app.db"),
  DEMO_MODE: booleanString,
  MASTER_KEY: z.string().min(32).default("development-only-master-key-change-me"),
  SESSION_SECRET: z.string().min(32).default("development-only-session-secret-change"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4.1-mini"),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GONG_BASE_URL: z.string().url().optional(),
  GONG_ACCESS_KEY: z.string().optional(),
  GONG_ACCESS_SECRET: z.string().optional(),
  TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().min(0).max(365).default(7),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;
let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}

export function resetEnvForTests(): void {
  cached = undefined;
}
