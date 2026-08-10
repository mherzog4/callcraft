import { NextResponse } from "next/server";
import { ensureSetup } from "@/src/jobs/setup";
import { readHealth } from "@/src/ops/health";
export const dynamic = "force-dynamic";
export function GET() {
  ensureSetup();
  const health = readHealth();
  // Deployment gates and uptime monitors both read this endpoint, so the
  // response stays 200 while degraded: a degraded service is still serving,
  // and the monitor alerts on `status`, not on a transport error.
  return NextResponse.json(health);
}
