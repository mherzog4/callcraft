import { describe, expect, it, vi } from "vitest";
import { OpenRouterGenerator } from "@/src/integrations/openrouter/client";
import { demoContext, demoParties, demoSegments } from "@/src/integrations/gong/fixtures";

function parseRequestBody(body: BodyInit | null | undefined): {
  messages: Array<{ role: string; content: string }>;
} {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  try {
    return JSON.parse(body) as { messages: Array<{ role: string; content: string }> };
  } catch (error) {
    throw new Error("Unable to parse OpenRouter request body", { cause: error });
  }
}

function parseParticipants(content: string): Array<{
  affiliation: string;
  email: string | null;
}> {
  try {
    const input = JSON.parse(content) as {
      participants: Array<{ affiliation: string; email: string | null }>;
    };
    return input.participants;
  } catch (error) {
    throw new Error("Unable to parse compose input", { cause: error });
  }
}

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
            id: "generation-123",
            provider: "Test Provider",
            choices: [{ message: { content: JSON.stringify(good) } }],
            usage: { total_tokens: 5, cost: 0.001 },
          }),
          { status: 200 },
        ),
      );
    const generator = new OpenRouterGenerator({
      apiKey: "test",
      baseUrl: "https://openrouter.example/api/v1",
      modelId: "test/model",
      fetch: fake,
    });
    const result = await generator.extract({
      segments: demoSegments,
      participants: demoParties,
      context: demoContext,
    });
    expect(result.value).toEqual(good);
    expect(result).toMatchObject({
      requestId: "generation-123",
      provider: "Test Provider",
      usage: { totalTokens: 5, cost: 0.001, repairAttempts: 1 },
    });
    expect(fake).toHaveBeenCalledTimes(2);
    const firstRequest = parseRequestBody(fake.mock.calls[0]![1]!.body);
    expect(firstRequest.messages[0]?.content).toContain('"participants": string[]');
    expect(firstRequest.messages[1]?.content).toContain("BEGIN_UNTRUSTED_DATA");
    const repairRequest = parseRequestBody(fake.mock.calls[1]![1]!.body);
    expect(repairRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant", content: "not json" }),
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("not valid JSON"),
        }),
      ]),
    );
  });

  it("repairs a structurally valid summary that violates evidence invariants", async () => {
    const evidence = [{ claim: "The call took place", segmentIds: [demoSegments[0]!.id] }];
    const base = {
      participants: [],
      pains: [],
      objections: [],
      commitments: [],
      nextSteps: [],
      evidence,
      uncertainty: [],
    };
    const fake = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ ...base, decisions: ["Unsupported decision"] }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ ...base, decisions: [] }) } }],
          }),
          { status: 200 },
        ),
      );
    const generator = new OpenRouterGenerator({
      apiKey: "test",
      baseUrl: "https://openrouter.example/api/v1",
      modelId: "test/model",
      fetch: fake,
    });
    const result = await generator.extract({
      segments: demoSegments,
      participants: demoParties,
      context: demoContext,
    });
    expect(result.value.decisions).toEqual([]);
    const repairRequest = parseRequestBody(fake.mock.calls[1]![1]!.body);
    expect(repairRequest.messages.at(-1)?.content).toContain(
      "Every material summary claim must have an exact evidence entry",
    );
  });

  it("does not expose internal participants as recipient choices", async () => {
    const claim = "The call took place";
    const fake = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  to: ["jordan.lee@example.org"],
                  cc: [],
                  claimSelections: [claim],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const generator = new OpenRouterGenerator({
      apiKey: "test",
      baseUrl: "https://openrouter.example/api/v1",
      modelId: "test/model",
      fetch: fake,
    });
    await generator.compose({
      summary: {
        participants: [],
        pains: [],
        decisions: [claim],
        objections: [],
        commitments: [],
        nextSteps: [],
        evidence: [{ claim, segmentIds: [demoSegments[0]!.id] }],
        uncertainty: [],
      },
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
    const request = parseRequestBody(fake.mock.calls[0]![1]!.body);
    const userMessage = request.messages.find((message) => message.role === "user");
    if (!userMessage) throw new Error("Missing compose user message");
    expect(parseParticipants(userMessage.content)).toEqual([
      expect.objectContaining({ affiliation: "External", email: "jordan.lee@example.org" }),
    ]);
  });
});
