import { getEnv } from "@/src/env";
import { assertProviderMode } from "@/src/runtime/policy";
import { OpenRouterGenerator } from "@/src/integrations/openrouter/client";
import { DemoGenerator } from "@/src/integrations/openrouter/mock";
import type { Generator } from "@/src/integrations/openrouter/types";

export function createGenerator(
  mode: "demo" | "real",
  configured?: { apiKey?: string; modelId?: string },
): Generator {
  const env = getEnv();
  assertProviderMode("openrouter", mode, env.APP_MODE);
  if (mode === "demo") return new DemoGenerator();
  const apiKey = configured?.apiKey ?? env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Real generation requires an OpenRouter API key");
  return new OpenRouterGenerator({
    apiKey,
    modelId: configured?.modelId ?? env.OPENROUTER_MODEL,
  });
}
