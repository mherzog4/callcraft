import { randomUUID } from "node:crypto";
import { ensureSetup } from "@/src/jobs/setup";
import { queueRegeneration } from "@/src/jobs/worker";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";
import { checkRateLimit } from "@/src/security/rate-limit";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!checkRateLimit(`generate:${request.headers.get("x-forwarded-for") ?? "local"}`, 5))
    return new Response("Rate limited", { status: 429 });
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  const data = await request.formData();
  const callId = String(data.get("callId") ?? "");
  queueRegeneration(callId, auth.sellerId, randomUUID());
  return redirect(request, `/calls/${encodeURIComponent(callId)}`);
}
