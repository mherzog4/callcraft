import { ensureSetup } from "@/src/jobs/setup";
import { resetDemoData } from "@/src/db/repositories";
import { DEMO_SELLER_ID, seedDemo } from "@/src/demo/seed";
import { resetDemoGong } from "@/src/integrations/gong";
import { getEnv } from "@/src/env";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!getEnv().DEMO_MODE) return new Response("Demo reset disabled", { status: 403 });
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  if (auth.sellerId !== DEMO_SELLER_ID)
    return new Response("Only the isolated demo seller can be reset", { status: 403 });
  resetDemoData(DEMO_SELLER_ID);
  resetDemoGong();
  seedDemo();
  return redirect(request, "/");
}
