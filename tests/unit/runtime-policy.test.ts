import { afterEach, describe, expect, it } from "vitest";
import { resetEnvForTests } from "@/src/env";
import { createGongAdapter } from "@/src/integrations/gong";
import { createGenerator } from "@/src/integrations/openrouter";
import {
  assertInstallationPolicy,
  assertProviderMode,
  requiredAdapterMode,
} from "@/src/runtime/policy";

const originalAppMode = process.env.APP_MODE;
const originalDemoMode = process.env.DEMO_MODE;

function setMode(mode: "demo" | "evaluation" | "production"): void {
  process.env.APP_MODE = mode;
  delete process.env.DEMO_MODE;
  resetEnvForTests();
}

afterEach(() => {
  if (originalAppMode === undefined) delete process.env.APP_MODE;
  else process.env.APP_MODE = originalAppMode;
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
  resetEnvForTests();
});

describe("runtime provider policy", () => {
  it("allows only the intended provider matrix", () => {
    expect(requiredAdapterMode("gong", "demo")).toBe("demo");
    expect(requiredAdapterMode("slack", "demo")).toBe("demo");
    expect(requiredAdapterMode("gong", "evaluation")).toBe("demo");
    expect(requiredAdapterMode("openrouter", "evaluation")).toBe("real");
    expect(requiredAdapterMode("slack", "evaluation")).toBe("real");
    expect(requiredAdapterMode("google", "evaluation")).toBe("real");
    expect(requiredAdapterMode("gong", "production")).toBe("real");
  });

  it("rejects invalid installation combinations", () => {
    expect(() => assertProviderMode("gong", "real", "evaluation")).toThrow(
      "expected demo, received real",
    );
    expect(() =>
      assertInstallationPolicy(
        [
          { provider: "gong", mode: "demo" },
          { provider: "slack", mode: "demo" },
        ],
        "evaluation",
      ),
    ).toThrow("Invalid slack adapter");
  });

  it("never falls back when an evaluation provider is misconfigured", () => {
    setMode("evaluation");
    expect(() => createGongAdapter("real")).toThrow("expected demo, received real");
    expect(() => createGenerator("demo")).toThrow("expected real, received demo");
    expect(() => createGenerator("real", { modelId: "test/model" })).toThrow("OpenRouter API key");
  });

  it("rejects conflicting APP_MODE and legacy DEMO_MODE", async () => {
    process.env.APP_MODE = "evaluation";
    process.env.DEMO_MODE = "true";
    resetEnvForTests();
    const { getEnv } = await import("@/src/env");
    expect(() => getEnv()).toThrow("APP_MODE conflicts with legacy DEMO_MODE");
  });
});
