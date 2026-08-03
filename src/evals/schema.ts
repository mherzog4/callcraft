import { z } from "zod";
import {
  callSummarySchema,
  emailDraftSchema,
  gongContextSchema,
  participantSchema,
  preferencesSchema,
  segmentSchema,
} from "@/src/domain/schemas";

const conceptExpectationSchema = z.object({
  name: z.string().min(1),
  alternatives: z.array(z.array(z.string().min(1)).min(1)).min(1),
});

export const evalScenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
  callTitle: z.string().min(1),
  retrievalQuery: z.string().min(1),
  segments: z.array(segmentSchema).min(1),
  participants: z.array(participantSchema).min(1),
  context: gongContextSchema.nullable(),
  preferences: preferencesSchema,
  expectations: z.object({
    concepts: z.array(conceptExpectationSchema).min(1),
    forbiddenTerms: z.array(z.string()).default([]),
    expectedTo: z.array(z.string().email()).min(1),
    expectedCc: z.array(z.string().email()).default([]),
    requiredEvidenceSegmentIds: z.array(z.string()).min(1),
  }),
  golden: z.object({
    summary: callSummarySchema,
    claimSelections: z.array(z.string()).min(1).max(8),
  }),
});
export type EvalScenario = z.infer<typeof evalScenarioSchema>;
export type EvalScenarioInput = z.input<typeof evalScenarioSchema>;

export const evalMetricsSchema = z.object({
  schemaValid: z.number().min(0).max(1),
  citationValidity: z.number().min(0).max(1),
  claimSupport: z.number().min(0).max(1),
  evidenceRecall: z.number().min(0).max(1),
  conceptRecall: z.number().min(0).max(1),
  recipientAccuracy: z.number().min(0).max(1),
  forbiddenTermSafety: z.number().min(0).max(1),
  draftGrounding: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
});
export type EvalMetrics = z.infer<typeof evalMetricsSchema>;

export const evalUsageSchema = z.object({
  promptTokens: z.number().nonnegative().default(0),
  completionTokens: z.number().nonnegative().default(0),
  totalTokens: z.number().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
  repairAttempts: z.number().int().nonnegative().default(0),
});

const evalScenarioResultSchema = z.object({
  scenarioId: z.string(),
  title: z.string(),
  status: z.enum(["passed", "failed", "error"]),
  metrics: evalMetricsSchema,
  latencyMs: z.object({ extract: z.number().nonnegative(), compose: z.number().nonnegative() }),
  usage: evalUsageSchema,
  provider: z.string().nullable(),
  requestIds: z.array(z.string()),
  failures: z.array(z.string()),
  error: z.string().nullable(),
  summary: callSummarySchema.nullable(),
  draft: emailDraftSchema.nullable(),
});
export type EvalScenarioResult = z.infer<typeof evalScenarioResultSchema>;

export const evalModelResultSchema = z.object({
  modelId: z.string(),
  aggregate: z.object({
    passRate: z.number().min(0).max(1),
    overall: z.number().min(0).max(1),
    citationValidity: z.number().min(0).max(1),
    claimSupport: z.number().min(0).max(1),
    conceptRecall: z.number().min(0).max(1),
    recipientAccuracy: z.number().min(0).max(1),
    p50LatencyMs: z.number().nonnegative(),
    totalTokens: z.number().nonnegative(),
    totalCost: z.number().nonnegative(),
  }),
  scenarios: z.array(evalScenarioResultSchema).min(1),
});
export type EvalModelResult = z.infer<typeof evalModelResultSchema>;

export const evalReportSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  createdAt: z.string().datetime(),
  mode: z.enum(["baseline", "live"]),
  datasetVersion: z.string(),
  gitCommit: z.string().nullable(),
  models: z.array(evalModelResultSchema).min(1),
});
export type EvalReport = z.infer<typeof evalReportSchema>;

export const retrievalReportSchema = z.object({
  version: z.literal(1),
  runId: z.string(),
  createdAt: z.string().datetime(),
  embeddingModel: z.string(),
  topK: z.number().int().positive(),
  aggregate: z.object({
    evidenceRecall: z.number().min(0).max(1),
    contextReduction: z.number().min(0).max(1),
  }),
  scenarios: z.array(
    z.object({
      scenarioId: z.string(),
      evidenceRecall: z.number().min(0).max(1),
      contextReduction: z.number().min(0).max(1),
      retrievedSegmentIds: z.array(z.string()),
      requiredEvidenceSegmentIds: z.array(z.string()),
    }),
  ),
});
export type RetrievalReport = z.infer<typeof retrievalReportSchema>;
