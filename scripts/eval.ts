import { spawnSync } from "node:child_process";
import { argumentValues } from "@/src/cli/arguments";
import { evalScenarios } from "@/src/evals/scenarios";
import { runBaselineEval, runLiveEval, writeEvalReport } from "@/src/evals/runner";
import { getEnv } from "@/src/env";

function gitCommit(): string | null {
  const result = spawnSync("git", ["rev-parse", "--short=12", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

const live = process.argv.includes("--live");
const selectedScenarios = argumentValues("--scenarios");
const scenarios = selectedScenarios.length
  ? evalScenarios.filter((scenario) => selectedScenarios.includes(scenario.id))
  : evalScenarios;
if (!scenarios.length) throw new Error("No evaluation scenarios matched --scenarios");

let report;
if (live) {
  const runtimeEnv = getEnv();
  const requestedModels = argumentValues("--models");
  const configuredModels = (
    process.env.EVAL_MODELS ??
    runtimeEnv.OPENROUTER_MODEL ??
    "google/gemini-2.5-flash"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  report = await runLiveEval({
    apiKey: runtimeEnv.OPENROUTER_API_KEY ?? "",
    baseUrl: runtimeEnv.OPENROUTER_BASE_URL,
    models: requestedModels.length ? requestedModels : configuredModels,
    scenarios,
    gitCommit: gitCommit(),
  });
} else {
  report = await runBaselineEval(gitCommit());
}
const paths = await writeEvalReport(report);

console.log(`\nCallCraft ${report.mode} evaluation · dataset ${report.datasetVersion}`);
console.table(
  report.models.map((model) => ({
    model: model.modelId,
    passRate: `${Math.round(model.aggregate.passRate * 100)}%`,
    citations: `${Math.round(model.aggregate.citationValidity * 100)}%`,
    claimSupport: `${Math.round(model.aggregate.claimSupport * 100)}%`,
    conceptRecall: `${Math.round(model.aggregate.conceptRecall * 100)}%`,
    recipients: `${Math.round(model.aggregate.recipientAccuracy * 100)}%`,
    p50LatencyMs: model.aggregate.p50LatencyMs,
    tokens: model.aggregate.totalTokens,
    costUsd: model.aggregate.totalCost.toFixed(6),
  })),
);
for (const model of report.models) {
  for (const scenario of model.scenarios.filter((item) => item.status !== "passed")) {
    console.error(
      `${model.modelId} · ${scenario.scenarioId} · ${scenario.status}: ${scenario.error ?? scenario.failures.join("; ")}`,
    );
  }
}
console.log(`Report: ${paths.reportPath}`);
console.log(`Dashboard source: ${paths.latestPath}`);

if (
  !process.argv.includes("--no-fail") &&
  report.models.some((model) => model.aggregate.passRate < 1)
) {
  process.exitCode = 1;
}
