import { describe, expect, it } from "vitest";
import { assertDraftGrounding, assertEvidence, callSummarySchema } from "@/src/domain/schemas";
import { DemoGenerator } from "@/src/integrations/openrouter/mock";
import { renderGroundedDraft } from "@/src/integrations/openrouter/grounded";
import { demoContext, demoParties, demoSegments } from "@/src/integrations/gong/fixtures";

describe("grounded generation", () => {
  it("produces validated evidence-backed summary and draft", async () => {
    const generator = new DemoGenerator();
    const summary = await generator.extract({
      segments: demoSegments,
      participants: demoParties,
      context: demoContext,
    });
    expect(() => assertEvidence(summary.value, demoSegments)).not.toThrow();
    expect(summary.value.evidence.length).toBeGreaterThan(0);
    const draft = await generator.compose({
      summary: summary.value,
      participants: demoParties,
      preferences: {
        tone: "warm",
        length: "medium",
        signature: "",
        retentionMode: "days",
        retentionDays: 7,
      },
      callTitle: "Demo",
    });
    expect(draft.value.to).toEqual(["jordan.lee@example.org"]);
  });
  it("rejects evidence that references nonexistent segments", () => {
    const summary = callSummarySchema.parse({
      participants: [],
      pains: [],
      decisions: [],
      objections: [],
      commitments: [],
      nextSteps: [],
      evidence: [{ claim: "invented", segmentIds: ["missing"] }],
      uncertainty: [],
    });
    expect(() => assertEvidence(summary, demoSegments)).toThrow(/unknown/);
  });
  it("rejects material claims without exact transcript evidence", () => {
    const summary = callSummarySchema.parse({
      participants: [],
      pains: ["Unsupported pain"],
      decisions: [],
      objections: [],
      commitments: [],
      nextSteps: [],
      evidence: [{ claim: "Different claim", segmentIds: [demoSegments[0]!.id] }],
      uncertainty: [],
    });
    expect(() => assertEvidence(summary, demoSegments)).toThrow(/material/);
  });
  it("rejects unsupported claims before rendering generated prose", async () => {
    const summary = await new DemoGenerator().extract({
      segments: demoSegments,
      participants: demoParties,
      context: demoContext,
    });
    expect(() =>
      renderGroundedDraft({
        plan: {
          to: ["jordan.lee@example.org"],
          cc: [],
          claimSelections: ["We committed to a $50,000 rollout tomorrow."],
        },
        summary: summary.value,
        participants: demoParties,
        preferences: {
          tone: "warm",
          length: "medium",
          signature: "Alex",
          retentionMode: "days",
          retentionDays: 7,
        },
        callTitle: "Demo",
      }),
    ).toThrow(/without transcript evidence/);
  });
  it("rejects unsupported dates and amounts in a generated draft", async () => {
    const summary = await new DemoGenerator().extract({
      segments: demoSegments,
      participants: demoParties,
      context: demoContext,
    });
    expect(() =>
      assertDraftGrounding(
        {
          to: ["jordan.lee@example.org"],
          cc: [],
          subject: "Follow-up",
          body: "We will send $50,000 pricing tomorrow.",
        },
        summary.value,
        demoParties,
      ),
    ).toThrow(/unsupported/);
  });
  it("rejects generated recipients and links absent from grounded inputs", () => {
    const summary = callSummarySchema.parse({
      participants: [],
      pains: [],
      decisions: [],
      objections: [],
      commitments: [],
      nextSteps: [],
      evidence: [{ claim: "Call occurred", segmentIds: [demoSegments[0]!.id] }],
      uncertainty: [],
    });
    expect(() =>
      assertDraftGrounding(
        {
          to: ["attacker@example.net"],
          cc: [],
          subject: "Next steps",
          body: "Visit https://attacker.example",
        },
        summary,
        demoParties,
      ),
    ).toThrow(/recipient/);
  });
});
