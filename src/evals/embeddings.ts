import { z } from "zod";

const embeddingResponseSchema = z.object({
  model: z.string(),
  data: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        embedding: z.array(z.number()).min(1),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
      cost: z.number().nullable().optional(),
    })
    .passthrough()
    .optional(),
});

export interface EmbeddingBatch {
  model: string;
  vectors: number[][];
  usage: { promptTokens: number; totalTokens: number; cost: number };
}

export async function createOpenRouterEmbeddings(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  texts: string[];
  fetch?: typeof fetch;
}): Promise<EmbeddingBatch> {
  if (!input.apiKey.trim()) throw new Error("OPENROUTER_API_KEY is required for retrieval evals");
  if (!input.texts.length) throw new Error("At least one embedding input is required");
  let response: Response;
  try {
    response = await (input.fetch ?? fetch)(`${input.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "x-title": "CallCraft sqlite-vec Retrieval Experiment",
      },
      body: JSON.stringify({ model: input.model, input: input.texts, encoding_format: "float" }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new Error("OpenRouter embeddings request failed", { cause: error });
  }
  if (!response.ok) {
    throw new Error(`OpenRouter embeddings returned HTTP ${response.status}`);
  }
  const parsed = embeddingResponseSchema.parse(await response.json());
  const ordered = [...parsed.data].sort((left, right) => left.index - right.index);
  if (ordered.length !== input.texts.length) {
    throw new Error("OpenRouter embeddings response count did not match the request");
  }
  const first = ordered[0];
  if (!first) throw new Error("OpenRouter embeddings response was empty");
  const dimensions = first.embedding.length;
  if (ordered.some((item) => item.embedding.length !== dimensions)) {
    throw new Error("OpenRouter embeddings returned inconsistent dimensions");
  }
  return {
    model: parsed.model,
    vectors: ordered.map((item) => item.embedding),
    usage: {
      promptTokens: parsed.usage?.prompt_tokens ?? 0,
      totalTokens: parsed.usage?.total_tokens ?? 0,
      cost: parsed.usage?.cost ?? 0,
    },
  };
}
