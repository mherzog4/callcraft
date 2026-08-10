import { randomUUID } from "node:crypto";
import { enqueueJob, getInstallation } from "@/src/db/repositories";
import { ensureSetup } from "@/src/jobs/setup";
import { enforceRateLimit } from "@/src/security/rate-limit";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

export function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  // Each accepted request fans out into provider polling on the worker, so the
  // bound is per seller rather than per address.
  const limited = enforceRateLimit(`sync:${auth.sellerId}`, 10);
  if (limited) return limited;
  const gong = getInstallation(auth.sellerId, "gong");
  if (!gong || gong.status !== "connected")
    return new Response("Connect Gong before syncing", { status: 409 });
  const openrouter = getInstallation(auth.sellerId, "openrouter");
  const slack = getInstallation(auth.sellerId, "slack");
  if (openrouter?.status !== "connected" || slack?.status !== "connected") {
    return new Response("Complete OpenRouter and Slack setup before syncing", { status: 409 });
  }
  enqueueJob("discover_calls", `discover:${gong.id}:manual:${randomUUID()}`, {
    sellerId: auth.sellerId,
    installationId: gong.id,
  });
  return redirect(request, "/");
}
