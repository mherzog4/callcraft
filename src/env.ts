import { z } from "zod";

const rawEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_PATH: z.string().min(1).default("./data/app.db"),
    APP_MODE: z.enum(["demo", "evaluation", "production"]).optional(),
    DEMO_MODE: z.enum(["true", "false"]).optional(),
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
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  })
  .superRefine((value, context) => {
    if (!value.APP_MODE || !value.DEMO_MODE) return;
    const legacyMode = value.DEMO_MODE === "true" ? "demo" : "production";
    if (value.APP_MODE !== legacyMode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_MODE"],
        message: "APP_MODE conflicts with legacy DEMO_MODE; remove DEMO_MODE",
      });
    }
  });

const envSchema = rawEnvSchema.transform((value) => {
  const appMode = value.APP_MODE ?? (value.DEMO_MODE === "false" ? "production" : "demo");
  return {
    ...value,
    APP_MODE: appMode,
    // Retained as a derived compatibility field while callers migrate to APP_MODE.
    DEMO_MODE: appMode === "demo",
  };
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
