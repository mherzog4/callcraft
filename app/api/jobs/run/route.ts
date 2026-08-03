import { randomUUID } from "node:crypto";
import { enqueueJob, getInstallation } from "@/src/db/repositories";
import { ensureSetup } from "@/src/jobs/setup";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  const gong = getInstallation(auth.sellerId, "gong");
  if (!gong || gong.status !== "connected")
    return new Response("Connect Gong before syncing", { status: 409 });
  enqueueJob("discover_calls", `discover:${gong.id}:manual:${randomUUID()}`, {
    sellerId: auth.sellerId,
    installationId: gong.id,
  });
  return redirect(request, "/");
}
