import { getEnv } from "@/src/env";
import { ensureSetup } from "@/src/jobs/setup";
import { queueConfirmedSend } from "@/src/jobs/worker";
import { getSeller } from "@/src/db/repositories";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

// Production sending is intentionally available only through the signed Slack
// confirmation flow. This endpoint exists solely to exercise the non-delivering
// preview adapter in the isolated seeded demo.
export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!getEnv().DEMO_MODE)
    return Response.json(
      { error: "Confirm email sending from the private Slack review" },
      { status: 410 },
    );
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  const form = await request.formData();
  const seller = getSeller(auth.sellerId);
  if (!seller) return new Response("Seller missing", { status: 404 });
  queueConfirmedSend({
    draftId: String(form.get("draftId") ?? ""),
    sellerId: seller.id,
    sender: seller.email,
  });
  return redirect(request, "/drafts");
}
