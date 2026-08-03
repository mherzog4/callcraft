import { describe, expect, it, vi } from "vitest";
import { OpenRouterGenerator } from "@/src/integrations/openrouter/client";
import { demoContext, demoParties, demoSegments } from "@/src/integrations/gong/fixtures";

describe("OpenRouter adapter", () => {
  it("repairs one malformed structured response", async () => {
    const good = {
      participants: [],
      pains: [],
      decisions: [],
      objections: [],
      commitments: [],
      nextSteps: [],
      evidence: [{ claim: "The call took place", segmentIds: [demoSegments[0]!.id] }],
      uncertainty: [],
    };
    const fake = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(good) } }],
            usage: { total_tokens: 5 },
          }),
          { status: 200 },
        ),
      );
    const generator = new OpenRouterGenerator({
      apiKey: "test",
      modelId: "test/model",
      fetch: fake,
    });
    const result = await generator.extract({
      segments: demoSegments,
      participants: demoParties,
      context: demoContext,
    });
    expect(result.value).toEqual(good);
    expect(fake).toHaveBeenCalledTimes(2);
    const request = JSON.parse(String(fake.mock.calls[0]![1]!.body)) as {
      messages: Array<{ content: string }>;
    };
    expect(request.messages[1]!.content).toContain("BEGIN_UNTRUSTED_DATA");
  });
});
