import { randomUUID } from "node:crypto";
import { ensureSetup } from "@/src/jobs/setup";
import { queueRegeneration } from "@/src/jobs/worker";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";
import { enforceRateLimit } from "@/src/security/rate-limit";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  // The forwarded address is client-controlled unless the proxy overwrites it,
  // so it only cheaply sheds unauthenticated floods before session work.
  const flooded = enforceRateLimit(
    `generate:ip:${request.headers.get("x-forwarded-for") ?? "local"}`,
    5,
  );
  if (flooded) return flooded;
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  // The seller identity comes from the signed session and cannot be spoofed,
  // so this is the limit that actually bounds model spend.
  const limited = enforceRateLimit(`generate:seller:${auth.sellerId}`, 10);
  if (limited) return limited;
  const data = await request.formData();
  const callId = String(data.get("callId") ?? "");
  queueRegeneration(callId, auth.sellerId, randomUUID());
  return redirect(request, `/calls/${encodeURIComponent(callId)}`);
}
