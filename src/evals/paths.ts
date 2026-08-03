import path from "node:path";

export function evalReportDirectory(): string {
  const configured = process.env.EVAL_REPORT_DIRECTORY?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data", "evals");
}
