import {
  assertDraftGrounding,
  assertEvidence,
  callSummarySchema,
  emailDraftSchema,
  type CallSummary,
  type EmailDraft,
} from "@/src/domain/schemas";
import {
  evalMetricsSchema,
  evalModelResultSchema,
  type EvalMetrics,
  type EvalModelResult,
  type EvalScenario,
  type EvalScenarioResult,
} from "@/src/evals/schema";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9@$:.%]+/g, " ")
    .trim();
const mean = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;
const highRiskLiteralPattern =
  /(?:[$€£]\s?\d[\d,.]*|\b\d+(?:\.\d+)?%|\b\d{1,2}:\d{2}(?:\s?[ap]\.??m\.?)?|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|yesterday)\b|\b\d+(?:[ -](?:day|week|month|year|seller|seat|user)s?)\b)/gi;
const stopWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "before",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "will",
  "with",
]);

function contentTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  );
}

function materialText(summary: CallSummary, draft: EmailDraft): string {
  return normalize(
    [
      ...summary.pains,
      ...summary.decisions,
      ...summary.objections,
      ...summary.commitments,
      ...summary.nextSteps,
      ...summary.uncertainty,
      ...summary.evidence.map((item) => item.claim),
      draft.subject,
      draft.body,
    ].join("\n"),
  );
}

export function scoreEvalCandidate(
  scenario: EvalScenario,
  summaryInput: unknown,
  draftInput: unknown,
): { metrics: EvalMetrics; failures: string[]; summary: CallSummary; draft: EmailDraft } {
  const summary = callSummarySchema.parse(summaryInput);
  const draft = emailDraftSchema.parse(draftInput);
  const failures: string[] = [];
  let citationValidity = 1;
  try {
    assertEvidence(summary, scenario.segments);
  } catch {
    citationValidity = 0;
    failures.push("Summary claims are not fully backed by valid transcript segment IDs");
  }

  const segmentById = new Map(scenario.segments.map((segment) => [segment.id, segment.text]));
  const supportedEvidence = summary.evidence.filter((evidence) => {
    const sourceText = evidence.segmentIds.map((id) => segmentById.get(id) ?? "").join(" ");
    const claimTokens = contentTokens(evidence.claim);
    const sourceTokens = contentTokens(sourceText);
    const overlap = [...claimTokens].filter((token) => sourceTokens.has(token)).length;
    const literalSupport = (evidence.claim.match(highRiskLiteralPattern) ?? []).every((literal) =>
      normalize(sourceText).includes(normalize(literal)),
    );
    return claimTokens.size > 0 && overlap / claimTokens.size >= 0.2 && literalSupport;
  });
  const claimSupport = summary.evidence.length
    ? supportedEvidence.length / summary.evidence.length
    : 0;
  if (claimSupport < 1) failures.push("One or more cited claims lack lexical transcript support");

  const cited = new Set(summary.evidence.flatMap((item) => item.segmentIds));
  const required = scenario.expectations.requiredEvidenceSegmentIds;
  const evidenceRecall = required.filter((id) => cited.has(id)).length / required.length;
  if (evidenceRecall < 1) failures.push("Required evidence segments were not all cited");

  const text = materialText(summary, draft);
  const matchedConcepts = scenario.expectations.concepts.filter((concept) =>
    concept.alternatives.some((alternative) =>
      alternative.every((term) => text.includes(normalize(term))),
    ),
  ).length;
  const conceptRecall = matchedConcepts / scenario.expectations.concepts.length;
  if (conceptRecall < 1) failures.push("Expected call concepts were omitted");

  const expectedTo = [...scenario.expectations.expectedTo]
    .map((value) => value.toLowerCase())
    .sort((left, right) => left.localeCompare(right));
  const actualTo = [...draft.to]
    .map((value) => value.toLowerCase())
    .sort((left, right) => left.localeCompare(right));
  const expectedCc = [...scenario.expectations.expectedCc]
    .map((value) => value.toLowerCase())
    .sort((left, right) => left.localeCompare(right));
  const actualCc = [...draft.cc]
    .map((value) => value.toLowerCase())
    .sort((left, right) => left.localeCompare(right));
  const recipientAccuracy =
    JSON.stringify(actualTo) === JSON.stringify(expectedTo) &&
    JSON.stringify(actualCc) === JSON.stringify(expectedCc)
      ? 1
      : 0;
  if (!recipientAccuracy) failures.push("Draft To/Cc recipients differ from the expected set");

  const forbiddenMatches = scenario.expectations.forbiddenTerms.filter((term) =>
    text.includes(normalize(term)),
  );
  const forbiddenTermSafety = forbiddenMatches.length ? 0 : 1;
  if (forbiddenMatches.length) {
    failures.push(`Forbidden unsupported content appeared: ${forbiddenMatches.join(", ")}`);
  }

  let draftGrounding = 1;
  try {
    assertDraftGrounding(draft, summary, scenario.participants, [
      scenario.callTitle,
      scenario.preferences.signature,
    ]);
  } catch {
    draftGrounding = 0;
    failures.push("Draft failed deterministic grounding checks");
  }

  const metrics = evalMetricsSchema.parse({
    schemaValid: 1,
    citationValidity,
    claimSupport: rounded(claimSupport),
    evidenceRecall: rounded(evidenceRecall),
    conceptRecall: rounded(conceptRecall),
    recipientAccuracy,
    forbiddenTermSafety,
    draftGrounding,
    overall: rounded(
      mean([
        citationValidity,
        claimSupport,
        evidenceRecall,
        conceptRecall,
        recipientAccuracy,
        forbiddenTermSafety,
        draftGrounding,
      ]),
    ),
  });
  return { metrics, failures, summary, draft };
}

export function errorMetrics(): EvalMetrics {
  return {
    schemaValid: 0,
    citationValidity: 0,
    claimSupport: 0,
    evidenceRecall: 0,
    conceptRecall: 0,
    recipientAccuracy: 0,
    forbiddenTermSafety: 0,
    draftGrounding: 0,
    overall: 0,
  };
}

export function aggregateModelResults(
  modelId: string,
  scenarios: EvalScenarioResult[],
): EvalModelResult {
  const latencies = scenarios
    .map((scenario) => scenario.latencyMs.extract + scenario.latencyMs.compose)
    .sort((left, right) => left - right);
  const midpoint = Math.floor(latencies.length / 2);
  const p50 =
    latencies.length % 2
      ? (latencies[midpoint] ?? 0)
      : mean(latencies.slice(midpoint - 1, midpoint + 1));
  return evalModelResultSchema.parse({
    modelId,
    aggregate: {
      passRate: rounded(
        scenarios.filter((scenario) => scenario.status === "passed").length / scenarios.length,
      ),
      overall: rounded(mean(scenarios.map((scenario) => scenario.metrics.overall))),
      citationValidity: rounded(
        mean(scenarios.map((scenario) => scenario.metrics.citationValidity)),
      ),
      claimSupport: rounded(mean(scenarios.map((scenario) => scenario.metrics.claimSupport))),
      conceptRecall: rounded(mean(scenarios.map((scenario) => scenario.metrics.conceptRecall))),
      recipientAccuracy: rounded(
        mean(scenarios.map((scenario) => scenario.metrics.recipientAccuracy)),
      ),
      p50LatencyMs: Math.round(p50),
      totalTokens: scenarios.reduce((total, scenario) => total + scenario.usage.totalTokens, 0),
      totalCost: rounded(scenarios.reduce((total, scenario) => total + scenario.usage.cost, 0)),
    },
    scenarios,
  });
}

export function passed(metrics: EvalMetrics, failures: string[]): boolean {
  return (
    metrics.overall >= 0.85 &&
    metrics.citationValidity === 1 &&
    metrics.claimSupport === 1 &&
    metrics.forbiddenTermSafety === 1 &&
    metrics.draftGrounding === 1 &&
    failures.length === 0
  );
}
