import { z } from "zod";

export const callStates = [
  "discovered",
  "awaiting_transcript",
  "ready",
  "extracting",
  "drafting",
  "delivering",
  "delivered",
  "retry_wait",
  "dead_letter",
] as const;
export const callStateSchema = z.enum(callStates);
export type CallState = z.infer<typeof callStateSchema>;

export const jobTypes = [
  "discover_calls",
  "fetch_call",
  "extract_summary",
  "compose_draft",
  "deliver_slack",
  "send_email",
  "cleanup",
] as const;
export const jobTypeSchema = z.enum(jobTypes);
export type JobType = z.infer<typeof jobTypeSchema>;

export const segmentSchema = z.object({
  id: z.string().min(1),
  speakerId: z.string().min(1),
  speakerName: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string().min(1).max(20_000),
  topic: z.string().nullable().default(null),
});
export type TranscriptSegment = z.infer<typeof segmentSchema>;

export const participantSchema = z.object({
  externalId: z.string(),
  speakerId: z.string().nullable(),
  name: z.string(),
  email: z.string().email().nullable(),
  title: z.string().nullable(),
  affiliation: z.enum(["Internal", "External", "Unknown"]),
});
export type Participant = z.infer<typeof participantSchema>;

export const gongContextSchema = z.object({
  brief: z.string().nullable(),
  outline: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  outcome: z.string().nullable(),
  keyPoints: z.array(z.string()).default([]),
});
export type GongContext = z.infer<typeof gongContextSchema>;

export const normalizedCallSchema = z.object({
  externalId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  startedAt: z.string().datetime(),
  durationSeconds: z.number().int().nonnegative(),
  primaryUserId: z.string(),
  language: z.string().nullable(),
  participants: z.array(participantSchema).default([]),
  context: gongContextSchema.nullable().default(null),
  segments: z.array(segmentSchema).default([]),
  providerRequestId: z.string().nullable().default(null),
});
export type NormalizedCall = z.infer<typeof normalizedCallSchema>;

export const evidenceSchema = z.object({
  claim: z.string().min(1).max(1000),
  segmentIds: z.array(z.string().min(1)).min(1).max(10),
});
export const callSummarySchema = z.object({
  participants: z.array(z.string()).max(20),
  pains: z.array(z.string()).max(10),
  decisions: z.array(z.string()).max(10),
  objections: z.array(z.string()).max(10),
  commitments: z.array(z.string()).max(10),
  nextSteps: z.array(z.string()).max(10),
  evidence: z.array(evidenceSchema).min(1).max(30),
  uncertainty: z.array(z.string()).max(10),
});
export type CallSummary = z.infer<typeof callSummarySchema>;

export const emailDraftSchema = z.object({
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).default([]),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20_000),
});
export type EmailDraft = z.infer<typeof emailDraftSchema>;

export const preferencesSchema = z.object({
  tone: z.enum(["concise", "warm", "consultative", "direct"]).default("warm"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  signature: z.string().max(1000).default(""),
  retentionMode: z.enum(["after_delivery", "days"]).default("days"),
  retentionDays: z.number().int().min(0).max(365).default(7),
});
export type SellerPreferences = z.infer<typeof preferencesSchema>;

export function assertEvidence(summary: CallSummary, segments: TranscriptSegment[]): void {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  if (!summary.evidence.length) throw new Error("Summary must contain transcript evidence");
  for (const evidence of summary.evidence) {
    if (evidence.segmentIds.some((id) => !byId.has(id))) {
      throw new Error("Summary evidence references an unknown transcript segment");
    }
    if (evidence.segmentIds.every((id) => !byId.get(id)?.text.trim())) {
      throw new Error("Summary evidence references empty transcript content");
    }
  }
  const evidenceClaims = new Set(summary.evidence.map((item) => item.claim.trim().toLowerCase()));
  const materialClaims = [
    ...summary.pains,
    ...summary.decisions,
    ...summary.objections,
    ...summary.commitments,
    ...summary.nextSteps,
  ];
  for (const claim of materialClaims) {
    if (!evidenceClaims.has(claim.trim().toLowerCase())) {
      throw new Error("Every material summary claim must have an exact evidence entry");
    }
  }
}

export function assertDraftGrounding(
  draft: EmailDraft,
  summary: CallSummary,
  participants: Participant[],
  allowedUserText: string[] = [],
): void {
  const allowed = new Set(
    participants.flatMap((party) =>
      party.affiliation === "External" && party.email ? [party.email.toLowerCase()] : [],
    ),
  );
  if ([...draft.to, ...draft.cc].some((address) => !allowed.has(address.toLowerCase()))) {
    throw new Error(
      "Generated draft contains a To/Cc recipient not present in external call participants",
    );
  }
  const source = [JSON.stringify(summary), JSON.stringify(participants), ...allowedUserText]
    .join("\n")
    .toLowerCase();
  const links = `${draft.subject}\n${draft.body}`.match(/https?:\/\/[^\s)]+/gi) ?? [];
  if (links.some((link) => !source.includes(link.toLowerCase()))) {
    throw new Error("Generated draft contains a link absent from the grounded summary");
  }
  // High-risk literals are where polished prose most often invents material facts.
  // The generated path additionally renders only exact evidence-linked claims.
  const highRisk =
    `${draft.subject}\n${draft.body}`.match(
      /(?:[$€£]\s?\d[\d,.]*|\b\d+(?:\.\d+)?%|\b\d{1,2}:\d{2}(?:\s?[ap]\.??m\.?)?|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|today|tomorrow|yesterday)\b|\b\d+(?:[ -](?:day|week|month|year|seller|seat|user)s?)\b)/gi,
    ) ?? [];
  if (highRisk.some((literal) => !source.includes(literal.toLowerCase()))) {
    throw new Error("Generated draft contains an unsupported date, amount, or commitment detail");
  }
}
