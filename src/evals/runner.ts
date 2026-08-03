import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CallSummary } from "@/src/domain/schemas";
import { evalReportDirectory } from "@/src/evals/paths";
import { evalScenarios, EVAL_DATASET_VERSION } from "@/src/evals/scenarios";
import {
  evalReportSchema,
  evalUsageSchema,
  type EvalReport,
  type EvalScenario,
  type EvalScenarioResult,
} from "@/src/evals/schema";
import {
  aggregateModelResults,
  errorMetrics,
  passed,
  scoreEvalCandidate,
} from "@/src/evals/scoring";
import { renderGroundedDraft } from "@/src/integrations/openrouter/grounded";
import { OpenRouterGenerator } from "@/src/integrations/openrouter/client";
import type { GenerationResult, Generator } from "@/src/integrations/openrouter/types";

function mergeUsage(
  ...results: Array<GenerationResult<unknown>>
): ReturnType<typeof evalUsageSchema.parse> {
  return evalUsageSchema.parse({
    promptTokens: results.reduce((total, result) => total + (result.usage.promptTokens ?? 0), 0),
    completionTokens: results.reduce(
      (total, result) => total + (result.usage.completionTokens ?? 0),
      0,
    ),
    totalTokens: results.reduce((total, result) => total + (result.usage.totalTokens ?? 0), 0),
    cost: results.reduce((total, result) => total + (result.usage.cost ?? 0), 0),
    repairAttempts: results.reduce(
      (total, result) => total + (result.usage.repairAttempts ?? 0),
      0,
    ),
  });
}

function baselineScenario(scenario: EvalScenario): EvalScenarioResult {
  const started = performance.now();
  try {
    const draft = renderGroundedDraft({
      plan: {
        to: scenario.expectations.expectedTo,
        cc: scenario.expectations.expectedCc,
        claimSelections: scenario.golden.claimSelections,
      },
      summary: scenario.golden.summary,
      participants: scenario.participants,
      preferences: scenario.preferences,
      callTitle: scenario.callTitle,
    });
    const scored = scoreEvalCandidate(scenario, scenario.golden.summary, draft);
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status: passed(scored.metrics, scored.failures) ? "passed" : "failed",
      metrics: scored.metrics,
      latencyMs: { extract: 0, compose: Math.round(performance.now() - started) },
      usage: evalUsageSchema.parse({}),
      provider: "local-golden",
      requestIds: [],
      failures: scored.failures,
      error: null,
      summary: scored.summary,
      draft: scored.draft,
    };
  } catch (error) {
    return errorScenario({
      scenario,
      error,
      summary: null,
      extractLatency: Math.round(performance.now() - started),
      composeLatency: 0,
    });
  }
}

function errorScenario(input: {
  scenario: EvalScenario;
  error: unknown;
  summary: CallSummary | null;
  extractLatency: number;
  composeLatency: number;
  partial?: Pick<EvalScenarioResult, "usage" | "provider" | "requestIds">;
}): EvalScenarioResult {
  const { scenario, error, summary, extractLatency, composeLatency, partial } = input;
  return {
    scenarioId: scenario.id,
    title: scenario.title,
    status: "error",
    metrics: errorMetrics(),
    latencyMs: { extract: extractLatency, compose: composeLatency },
    usage: partial?.usage ?? evalUsageSchema.parse({}),
    provider: partial?.provider ?? null,
    requestIds: partial?.requestIds ?? [],
    failures: ["Pipeline did not produce a scoreable grounded draft"],
    error: error instanceof Error ? error.message : "Unknown evaluation error",
    summary,
    draft: null,
  };
}

async function liveScenario(
  scenario: EvalScenario,
  generator: Generator,
): Promise<EvalScenarioResult> {
  let summary: CallSummary | null = null;
  let extractLatency = 0;
  let composeLatency = 0;
  let extraction: GenerationResult<CallSummary> | null = null;
  try {
    const extractStarted = performance.now();
    extraction = await generator.extract({
      segments: scenario.segments,
      participants: scenario.participants,
      context: scenario.context,
    });
    extractLatency = Math.round(performance.now() - extractStarted);
    summary = extraction.value;
    const composeStarted = performance.now();
    const composition = await generator.compose({
      summary,
      participants: scenario.participants,
      preferences: scenario.preferences,
      callTitle: scenario.callTitle,
    });
    composeLatency = Math.round(performance.now() - composeStarted);
    const scored = scoreEvalCandidate(scenario, summary, composition.value);
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      status: passed(scored.metrics, scored.failures) ? "passed" : "failed",
      metrics: scored.metrics,
      latencyMs: { extract: extractLatency, compose: composeLatency },
      usage: mergeUsage(extraction, composition),
      provider: composition.provider ?? extraction.provider ?? null,
      requestIds: [extraction.requestId, composition.requestId].filter((value): value is string =>
        Boolean(value),
      ),
      failures: scored.failures,
      error: null,
      summary: scored.summary,
      draft: scored.draft,
    };
  } catch (error) {
    return errorScenario({
      scenario,
      error,
      summary,
      extractLatency,
      composeLatency,
      partial: {
        usage: extraction ? mergeUsage(extraction) : evalUsageSchema.parse({}),
        provider: extraction?.provider ?? null,
        requestIds: extraction?.requestId ? [extraction.requestId] : [],
      },
    });
  }
}

export async function runBaselineEval(gitCommit: string | null = null): Promise<EvalReport> {
  const modelId = "golden-reference-v1";
  const results = evalScenarios.map(baselineScenario);
  return evalReportSchema.parse({
    version: 1,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    mode: "baseline",
    datasetVersion: EVAL_DATASET_VERSION,
    gitCommit,
    models: [aggregateModelResults(modelId, results)],
  });
}

export async function runLiveEval(input: {
  apiKey: string;
  baseUrl: string;
  models: string[];
  scenarios?: EvalScenario[];
  gitCommit?: string | null;
  createGenerator?: (modelId: string) => Generator;
}): Promise<EvalReport> {
  if (!input.apiKey.trim()) throw new Error("OPENROUTER_API_KEY is required for live evals");
  if (!input.models.length) throw new Error("At least one OpenRouter model is required");
  const scenarios = input.scenarios ?? evalScenarios;
  const models = [];
  for (const modelId of input.models) {
    const generator = input.createGenerator
      ? input.createGenerator(modelId)
      : new OpenRouterGenerator({ apiKey: input.apiKey, baseUrl: input.baseUrl, modelId });
    const results: EvalScenarioResult[] = [];
    for (const scenario of scenarios) results.push(await liveScenario(scenario, generator));
    models.push(aggregateModelResults(modelId, results));
  }
  return evalReportSchema.parse({
    version: 1,
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    mode: "live",
    datasetVersion: EVAL_DATASET_VERSION,
    gitCommit: input.gitCommit ?? null,
    models,
  });
}

export async function writeEvalReport(
  report: EvalReport,
  directory = evalReportDirectory(),
): Promise<{ reportPath: string; latestPath: string }> {
  await fs.mkdir(directory, { recursive: true });
  const reportPath = path.join(
    directory,
    `${report.createdAt.replaceAll(":", "-")}-${report.mode}.json`,
  );
  const latestPath = path.join(directory, "latest.json");
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(reportPath, serialized, { mode: 0o600 });
  const temporary = `${latestPath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, serialized, { mode: 0o600 });
  await fs.rename(temporary, latestPath);
  return { reportPath, latestPath };
}

export async function readEvalReport(filePath: string): Promise<EvalReport> {
  const raw = await fs.readFile(filePath, "utf8");
  try {
    return evalReportSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(`Evaluation report is invalid: ${filePath}`, { cause: error });
  }
}
