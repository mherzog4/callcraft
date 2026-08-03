import path from "node:path";
import { evalReportDirectory } from "@/src/evals/paths";
import { retrievalReportSchema, type EvalReport, type RetrievalReport } from "@/src/evals/schema";
import { readEvalReport } from "@/src/evals/runner";
import fs from "node:fs/promises";

export async function loadLatestRetrievalReport(): Promise<RetrievalReport | null> {
  const reportPath = path.join(evalReportDirectory(), "retrieval-latest.json");
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    return retrievalReportSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadLatestEvalReport(): Promise<{
  report: EvalReport;
  source: "latest" | "sample";
}> {
  const latest = path.join(evalReportDirectory(), "latest.json");
  try {
    return { report: await readEvalReport(latest), source: "latest" };
  } catch {
    const sample = path.join(process.cwd(), "evals", "sample-report.json");
    return { report: await readEvalReport(sample), source: "sample" };
  }
}
