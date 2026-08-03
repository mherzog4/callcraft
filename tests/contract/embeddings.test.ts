import { describe, expect, it, vi } from "vitest";
import { createOpenRouterEmbeddings } from "@/src/evals/embeddings";

describe("OpenRouter embeddings adapter", () => {
  it("batches text with explicit model selection and validates vector dimensions", async () => {
    const fake = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "openai/text-embedding-3-small",
          data: [
            { index: 1, embedding: [0, 1, 0] },
            { index: 0, embedding: [1, 0, 0] },
          ],
          usage: { prompt_tokens: 4, total_tokens: 4, cost: 0.0001 },
        }),
        { status: 200 },
      ),
    );
    const result = await createOpenRouterEmbeddings({
      apiKey: "test-key",
      baseUrl: "https://openrouter.example/api/v1",
      model: "openai/text-embedding-3-small",
      texts: ["first", "second"],
      fetch: fake,
    });
    expect(result.vectors).toEqual([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(result.usage).toMatchObject({ totalTokens: 4, cost: 0.0001 });
    const [url, init] = fake.mock.calls[0]!;
    expect(url).toBe("https://openrouter.example/api/v1/embeddings");
    const body = String(init.body);
    expect(body).toContain('"model":"openai/text-embedding-3-small"');
    expect(body).toContain('"input":["first","second"]');
    expect(body).toContain('"encoding_format":"float"');
  });
});
