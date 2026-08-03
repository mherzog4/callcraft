import { getEnv } from "@/src/env";
import { assertProviderMode } from "@/src/runtime/policy";
import { GongHttpClient } from "@/src/integrations/gong/client";
import type { GongAdapter } from "@/src/integrations/gong/contract";
import { SeededGongAdapter } from "@/src/integrations/gong/mock";
import { RealGongAdapter } from "@/src/integrations/gong/real";

const demos = new Map<string, SeededGongAdapter>();
export function createGongAdapter(
  mode: "demo" | "real",
  configured?: {
    key?: string;
    baseUrl?: string;
    accessKey?: string;
    accessSecret?: string;
    failMode?: "rate_limit" | "provider";
  },
): GongAdapter {
  const env = getEnv();
  assertProviderMode("gong", mode, env.APP_MODE);
  if (mode === "demo") {
    const key = `${configured?.key ?? "default"}:${configured?.failMode ?? "ok"}`;
    let adapter = demos.get(key);
    if (!adapter) {
      adapter = new SeededGongAdapter({
        pendingOnce: true,
        ...(configured?.failMode ? { failMode: configured.failMode } : {}),
      });
      demos.set(key, adapter);
    }
    return adapter;
  }
  const baseUrl = configured?.baseUrl ?? env.GONG_BASE_URL;
  const accessKey = configured?.accessKey ?? env.GONG_ACCESS_KEY;
  const accessSecret = configured?.accessSecret ?? env.GONG_ACCESS_SECRET;
  if (!baseUrl || !accessKey || !accessSecret)
    throw new Error("Real Gong mode requires base URL, access key, and access secret");
  return new RealGongAdapter(new GongHttpClient({ baseUrl, accessKey, accessSecret }));
}
export function resetDemoGong(): void {
  for (const demo of demos.values()) demo.reset();
  demos.clear();
}
