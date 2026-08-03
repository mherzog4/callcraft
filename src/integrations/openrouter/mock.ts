import type { CallSummary, EmailDraft } from "@/src/domain/schemas";
import { assertEvidence } from "@/src/domain/schemas";
import { renderGroundedDraft } from "@/src/integrations/openrouter/grounded";
import type { GenerationResult, Generator } from "@/src/integrations/openrouter/types";

export class DemoGenerator implements Generator {
  async extract(
    input: Parameters<Generator["extract"]>[0],
  ): Promise<GenerationResult<CallSummary>> {
    const first = input.segments[0]?.id;
    const security = input.segments[2]?.id;
    const next = input.segments[3]?.id;
    if (!first || !security || !next)
      throw new Error("Demo fixture lacks required evidence segments");
    const value: CallSummary = {
      participants: input.participants.map(
        (party) => `${party.name}${party.title ? ` — ${party.title}` : ""}`,
      ),
      pains: ["The customer team spends about two hours weekly writing call follow-ups."],
      decisions: ["Start with a five-seller pilot before broader rollout."],
      objections: [
        "Security requires SOC 2 and retention documentation before Gmail is connected.",
      ],
      commitments: ["Alex will send the security packet and pilot pricing."],
      nextSteps: ["Meet next Tuesday at 10:00 Pacific after sending materials."],
      evidence: [
        {
          claim: "The customer team spends about two hours weekly writing call follow-ups.",
          segmentIds: [first],
        },
        { claim: "Start with a five-seller pilot before broader rollout.", segmentIds: [first] },
        {
          claim: "Security requires SOC 2 and retention documentation before Gmail is connected.",
          segmentIds: [security],
        },
        { claim: "Alex will send the security packet and pilot pricing.", segmentIds: [next] },
        {
          claim: "Meet next Tuesday at 10:00 Pacific after sending materials.",
          segmentIds: [next],
        },
      ],
      uncertainty: ["The transcript does not include Sam's email address."],
    };
    assertEvidence(value, input.segments);
    return {
      value,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      modelId: "demo-grounded-v1",
    };
  }
  async compose(input: Parameters<Generator["compose"]>[0]): Promise<GenerationResult<EmailDraft>> {
    const external = input.participants.flatMap((party) =>
      party.affiliation === "External" && party.email ? [party.email] : [],
    );
    const value = renderGroundedDraft({
      ...input,
      plan: {
        to: external,
        cc: [],
        claimSelections: [
          ...input.summary.decisions,
          ...input.summary.commitments,
          ...input.summary.nextSteps,
        ],
      },
    });
    return {
      value,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      modelId: "demo-grounded-v1",
    };
  }
}
