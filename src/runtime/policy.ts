import { getEnv, type Env } from "@/src/env";

export type AppMode = Env["APP_MODE"];
export type Provider = "gong" | "slack" | "google" | "openrouter";
export type AdapterMode = "demo" | "real";

const allowedModes: Record<AppMode, Record<Provider, AdapterMode>> = {
  demo: {
    gong: "demo",
    slack: "demo",
    google: "demo",
    openrouter: "demo",
  },
  evaluation: {
    gong: "demo",
    slack: "real",
    google: "real",
    openrouter: "real",
  },
  production: {
    gong: "real",
    slack: "real",
    google: "real",
    openrouter: "real",
  },
};

export function requiredAdapterMode(provider: Provider, appMode = getEnv().APP_MODE): AdapterMode {
  return allowedModes[appMode][provider];
}

export function assertProviderMode(
  provider: Provider,
  adapterMode: AdapterMode,
  appMode = getEnv().APP_MODE,
): void {
  const required = requiredAdapterMode(provider, appMode);
  if (adapterMode !== required) {
    throw new Error(
      `Invalid ${provider} adapter for APP_MODE=${appMode}: expected ${required}, received ${adapterMode}`,
    );
  }
}

export function assertInstallationPolicy(
  installations: Array<{ provider: string; mode: string }>,
  appMode = getEnv().APP_MODE,
): void {
  for (const installation of installations) {
    if (!(installation.provider in allowedModes[appMode])) {
      throw new Error(`Unknown provider in installation policy: ${installation.provider}`);
    }
    if (installation.mode !== "demo" && installation.mode !== "real") {
      throw new Error(`Unknown adapter mode in installation policy: ${installation.mode}`);
    }
    assertProviderMode(installation.provider as Provider, installation.mode, appMode);
  }
}

export function allowsRealOAuth(appMode = getEnv().APP_MODE): boolean {
  return appMode !== "demo";
}

export function isDemoMode(appMode = getEnv().APP_MODE): boolean {
  return appMode === "demo";
}

export function isEvaluationMode(appMode = getEnv().APP_MODE): boolean {
  return appMode === "evaluation";
}
