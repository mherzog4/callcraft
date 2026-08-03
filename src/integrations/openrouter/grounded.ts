import { z } from "zod";
import {
  assertDraftGrounding,
  emailDraftSchema,
  type CallSummary,
  type EmailDraft,
  type Participant,
  type SellerPreferences,
} from "@/src/domain/schemas";

export const groundedDraftPlanSchema = z.object({
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).default([]),
  claimSelections: z.array(z.string().min(1).max(1000)).min(1).max(8),
});
export type GroundedDraftPlan = z.infer<typeof groundedDraftPlanSchema>;

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export function renderGroundedDraft(input: {
  plan: GroundedDraftPlan;
  summary: CallSummary;
  participants: Participant[];
  preferences: SellerPreferences;
  callTitle: string;
}): EmailDraft {
  const supported = new Map(
    [
      ...input.summary.pains,
      ...input.summary.decisions,
      ...input.summary.objections,
      ...input.summary.commitments,
      ...input.summary.nextSteps,
    ].map((claim) => [normalize(claim), claim]),
  );
  const evidence = new Set(input.summary.evidence.map((item) => normalize(item.claim)));
  const claims = input.plan.claimSelections.map((selection) => {
    const key = normalize(selection);
    const exact = supported.get(key);
    if (!exact || !evidence.has(key)) {
      throw new Error("Draft plan selected a claim without transcript evidence");
    }
    return exact;
  });
  const external = input.participants.filter((party) => party.affiliation === "External");
  const firstName = external[0]?.name.trim().split(/\s+/)[0] || "there";
  const opening =
    input.preferences.tone === "direct"
      ? "Thank you for the conversation."
      : input.preferences.tone === "concise"
        ? "Thanks for your time."
        : "Thanks for the thoughtful conversation.";
  const closing =
    input.preferences.tone === "direct"
      ? "Please let me know if anything above needs to change."
      : "Please let me know if I missed anything.";
  const limit =
    input.preferences.length === "short" ? 3 : input.preferences.length === "long" ? 8 : 5;
  const body = [
    `Hi ${firstName},`,
    opening,
    ...claims.slice(0, limit),
    closing,
    input.preferences.signature.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
  const draft = emailDraftSchema.parse({
    to: input.plan.to,
    cc: input.plan.cc,
    subject: `Follow-up: ${input.callTitle}`.slice(0, 200),
    body,
  });
  assertDraftGrounding(draft, input.summary, input.participants, [
    input.callTitle,
    input.preferences.signature,
  ]);
  return draft;
}
