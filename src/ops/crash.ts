import { getEnv } from "@/src/env";
import { logger } from "@/src/security/logger";

// Crash reports carry only the error's shape. A message can quote a
// transcript line, a recipient, or a token that failed to parse, so nothing
// beyond name and stack leaves this process — the same rule the logger's
// redaction applies to ordinary events.
export type CrashReport = {
  component: string;
  reason: "uncaughtException" | "unhandledRejection";
  errorName: string;
  stack: string | null;
};

// `error.stack` opens with "Name: message", so passing it through verbatim
// would defeat the rule above. Only the frame lines are kept.
function stackFrames(error: Error): string | null {
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("at "));
  return frames.length > 0 ? frames.join("\n") : null;
}

export function describeCrash(
  component: string,
  reason: CrashReport["reason"],
  error: unknown,
): CrashReport {
  return {
    component,
    reason,
    errorName: error instanceof Error ? error.name : typeof error,
    stack: error instanceof Error ? stackFrames(error) : null,
  };
}

export async function reportCrash(report: CrashReport): Promise<void> {
  logger.fatal({ category: "crash", ...report }, "Process crashed");
  const url = getEnv().ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    // The webhook is best-effort. A failed delivery must not replace the
    // original crash with a less useful one.
    logger.error(
      { category: "crash_webhook", errorName: error instanceof Error ? error.name : "unknown" },
      "Crash webhook delivery failed",
    );
  }
}

// Exits non-zero on purpose: the supervisor restarting a dead worker is the
// recovery path, and a worker that stays up after an unhandled rejection
// processes nothing while looking alive.
export function installCrashHandlers(component: string): void {
  const handle = (reason: CrashReport["reason"]) => (error: unknown) => {
    void reportCrash(describeCrash(component, reason, error)).finally(() => process.exit(1));
  };
  process.on("uncaughtException", handle("uncaughtException"));
  process.on("unhandledRejection", handle("unhandledRejection"));
}
