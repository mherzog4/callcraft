import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { createOpenRouterEmbeddings } from "@/src/evals/embeddings";
import { evalReportDirectory } from "@/src/evals/paths";
import { evalScenarios } from "@/src/evals/scenarios";
import { retrievalReportSchema, type RetrievalReport } from "@/src/evals/schema";

function vectorBuffer(vector: number[]): Buffer {
  const typed = Float32Array.from(vector);
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

const loadedDatabases = new WeakSet<Database.Database>();
const vectorTableStatements = new Map<number, string>([
  [384, "CREATE VIRTUAL TABLE vec_eval_segments USING vec0(embedding float[384])"],
  [512, "CREATE VIRTUAL TABLE vec_eval_segments USING vec0(embedding float[512])"],
  [768, "CREATE VIRTUAL TABLE vec_eval_segments USING vec0(embedding float[768])"],
  [1024, "CREATE VIRTUAL TABLE vec_eval_segments USING vec0(embedding float[1024])"],
  [1536, "CREATE VIRTUAL TABLE vec_eval_segments USING vec0(embedding float[1536])"],
  [3072, "CREATE VIRTUAL TABLE vec_eval_segments USING vec0(embedding float[3072])"],
]);

export function sqliteVecNearest(input: {
  db: Database.Database;
  vectors: number[][];
  query: number[];
  topK: number;
}): number[] {
  const dimensions = input.query.length;
  if (!dimensions || input.vectors.some((vector) => vector.length !== dimensions)) {
    throw new Error("sqlite-vec vectors must have consistent non-zero dimensions");
  }
  const createStatement = vectorTableStatements.get(dimensions);
  if (!createStatement) {
    throw new Error(`Unsupported embedding dimension for sqlite-vec experiment: ${dimensions}`);
  }
  if (!loadedDatabases.has(input.db)) {
    sqliteVec.load(input.db);
    loadedDatabases.add(input.db);
  }
  input.db.exec("DROP TABLE IF EXISTS vec_eval_segments");
  input.db.exec(createStatement);
  const insert = input.db.prepare("INSERT INTO vec_eval_segments(rowid, embedding) VALUES (?, ?)");
  input.db.transaction(() => {
    input.vectors.forEach((vector, index) => insert.run(BigInt(index + 1), vectorBuffer(vector)));
  })();
  const rows = input.db
    .prepare(
      "SELECT rowid, distance FROM vec_eval_segments WHERE embedding MATCH ? ORDER BY distance LIMIT ?",
    )
    .all(vectorBuffer(input.query), Math.min(input.topK, input.vectors.length)) as Array<{
    rowid: number;
    distance: number;
  }>;
  return rows.map((row) => row.rowid - 1);
}

export async function runRetrievalExperiment(input: {
  apiKey: string;
  baseUrl: string;
  embeddingModel: string;
  topK?: number;
  databasePath?: string;
  fetch?: typeof fetch;
}): Promise<RetrievalReport> {
  const topK = input.topK ?? 3;
  if (topK < 1 || topK > 20) throw new Error("topK must be between 1 and 20");
  const texts = evalScenarios.flatMap((scenario) => [
    ...scenario.segments.map((segment) => segment.text),
    scenario.retrievalQuery,
  ]);
  const embeddings = await createOpenRouterEmbeddings({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    model: input.embeddingModel,
    texts,
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });
  const databasePath = input.databasePath ?? ":memory:";
  if (databasePath !== ":memory:") await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  try {
    let offset = 0;
    const scenarios = evalScenarios.map((scenario) => {
      const segmentVectors = embeddings.vectors.slice(offset, offset + scenario.segments.length);
      offset += scenario.segments.length;
      const query = embeddings.vectors[offset];
      if (!query) throw new Error(`Missing query embedding for ${scenario.id}`);
      offset += 1;
      const nearestIndexes = sqliteVecNearest({
        db,
        vectors: segmentVectors,
        query,
        topK,
      });
      const retrievedSegmentIds = nearestIndexes.flatMap((index) => {
        const segment = scenario.segments[index];
        return segment ? [segment.id] : [];
      });
      const required = new Set(scenario.expectations.requiredEvidenceSegmentIds);
      const evidenceRecall =
        retrievedSegmentIds.filter((segmentId) => required.has(segmentId)).length / required.size;
      return {
        scenarioId: scenario.id,
        evidenceRecall,
        contextReduction: 1 - retrievedSegmentIds.length / scenario.segments.length,
        retrievedSegmentIds,
        requiredEvidenceSegmentIds: [...required],
      };
    });
    return retrievalReportSchema.parse({
      version: 1,
      runId: randomUUID(),
      createdAt: new Date().toISOString(),
      embeddingModel: embeddings.model,
      topK,
      aggregate: {
        evidenceRecall: mean(scenarios.map((scenario) => scenario.evidenceRecall)),
        contextReduction: mean(scenarios.map((scenario) => scenario.contextReduction)),
      },
      scenarios,
    });
  } finally {
    db.close();
  }
}

export async function writeRetrievalReport(
  report: RetrievalReport,
  directory = evalReportDirectory(),
): Promise<string> {
  await fs.mkdir(directory, { recursive: true });
  const reportPath = path.join(directory, "retrieval-latest.json");
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return reportPath;
}
