import { NextResponse } from "next/server";
import { ensureSetup } from "@/src/jobs/setup";
import { listJobs } from "@/src/db/repositories";
export const dynamic = "force-dynamic";
export function GET() {
  ensureSetup();
  const jobs = listJobs();
  return NextResponse.json({
    status: jobs.some((job) => job.status === "dead_letter") ? "degraded" : "ok",
    deadLetters: jobs.filter((job) => job.status === "dead_letter").length,
  });
}
