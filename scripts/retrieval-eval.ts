import path from "node:path";
import { argumentValue } from "@/src/cli/arguments";
import { evalReportDirectory } from "@/src/evals/paths";
import { runRetrievalExperiment, writeRetrievalReport } from "@/src/evals/retrieval";
import { getEnv } from "@/src/env";

const embeddingModel =
  argumentValue("--model") ??
  process.env.OPENROUTER_EMBEDDING_MODEL ??
  "openai/text-embedding-3-small";
const topK = Number(argumentValue("--top-k") ?? "3");
const env = getEnv();
const report = await runRetrievalExperiment({
  apiKey: env.OPENROUTER_API_KEY ?? "",
  baseUrl: env.OPENROUTER_BASE_URL,
  embeddingModel,
  topK,
  databasePath: path.join(evalReportDirectory(), "retrieval.sqlite"),
});
const reportPath = await writeRetrievalReport(report);

console.log("\nCallCraft sqlite-vec retrieval experiment");
console.log(`Embedding model: ${report.embeddingModel}`);
console.log(`Top K: ${report.topK}`);
console.log(`Evidence recall: ${Math.round(report.aggregate.evidenceRecall * 100)}%`);
console.log(`Context reduction: ${Math.round(report.aggregate.contextReduction * 100)}%`);
console.table(
  report.scenarios.map((scenario) => ({
    scenario: scenario.scenarioId,
    evidenceRecall: `${Math.round(scenario.evidenceRecall * 100)}%`,
    contextReduction: `${Math.round(scenario.contextReduction * 100)}%`,
    retrieved: scenario.retrievedSegmentIds.join(", "),
  })),
);
console.log(`Report: ${reportPath}`);
