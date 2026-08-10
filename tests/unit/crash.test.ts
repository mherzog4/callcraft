import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeCrash, reportCrash } from "@/src/ops/crash";
import { resetEnvForTests } from "@/src/env";

const originalWebhook = process.env.ERROR_WEBHOOK_URL;

beforeEach(() => {
  resetEnvForTests();
});

afterEach(() => {
  if (originalWebhook === undefined) delete process.env.ERROR_WEBHOOK_URL;
  else process.env.ERROR_WEBHOOK_URL = originalWebhook;
  resetEnvForTests();
  vi.restoreAllMocks();
});

describe("crash reporting", () => {
  // The whole point of the report shape: an error message can quote a
  // transcript line, a recipient, or a credential that failed to parse.
  it("carries the error's shape and never its message", () => {
    const report = describeCrash(
      "worker",
      "uncaughtException",
      new Error("failed for jordan.lee@example.org with token sk-secret"),
    );
    expect(report.errorName).toBe("Error");
    expect(JSON.stringify(report)).not.toContain("jordan.lee@example.org");
    expect(JSON.stringify(report)).not.toContain("sk-secret");
  });

  it("describes a non-Error rejection without throwing", () => {
    const report = describeCrash("worker", "unhandledRejection", "plain string");
    expect(report.errorName).toBe("string");
    expect(report.stack).toBeNull();
  });

  it("posts the report when a webhook is configured", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://alerts.example.com/hook";
    resetEnvForTests();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await reportCrash(describeCrash("worker", "uncaughtException", new Error("boom")));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://alerts.example.com/hook");
  });

  it("survives a webhook that rejects", async () => {
    process.env.ERROR_WEBHOOK_URL = "https://alerts.example.com/hook";
    resetEnvForTests();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(
      reportCrash(describeCrash("worker", "uncaughtException", new Error("boom"))),
    ).resolves.toBeUndefined();
  });

  it("does nothing over the network when no webhook is configured", async () => {
    delete process.env.ERROR_WEBHOOK_URL;
    resetEnvForTests();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await reportCrash(describeCrash("worker", "unhandledRejection", new Error("boom")));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
