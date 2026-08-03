import { ensureSetup } from "@/src/jobs/setup";
import { resetDemoData, resetSyntheticData } from "@/src/db/repositories";
import { DEMO_SELLER_ID, seedDemo } from "@/src/demo/seed";
import { resetDemoGong } from "@/src/integrations/gong";
import { getEnv } from "@/src/env";
import { isDemoMode, isEvaluationMode } from "@/src/runtime/policy";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  const appMode = getEnv().APP_MODE;
  if (!isDemoMode(appMode) && !isEvaluationMode(appMode))
    return new Response("Synthetic reset disabled", { status: 403 });
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  if (isDemoMode(appMode)) {
    if (auth.sellerId !== DEMO_SELLER_ID)
      return new Response("Only the isolated demo seller can be reset", { status: 403 });
    resetDemoData(DEMO_SELLER_ID);
    resetDemoGong();
    seedDemo();
  } else {
    resetSyntheticData(auth.sellerId);
    resetDemoGong();
  }
  return redirect(request, "/");
}
