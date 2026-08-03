import { getEnv } from "@/src/env";
import type { Generator } from "./types";
import { DemoGenerator } from "./mock";
import { OpenRouterGenerator } from "./client";

export function createGenerator(
  mode: "demo" | "real",
  configured?: { apiKey?: string; modelId?: string },
): Generator {
  const env = getEnv();
  if (env.DEMO_MODE && mode !== "demo")
    throw new Error("Real provider access is disabled while DEMO_MODE=true");
  if (mode === "demo") return new DemoGenerator();
  const apiKey = configured?.apiKey ?? env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Real generation requires an OpenRouter API key");
  return new OpenRouterGenerator({
    apiKey,
    modelId: configured?.modelId ?? env.OPENROUTER_MODEL,
  });
}
