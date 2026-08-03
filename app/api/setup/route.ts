import { z } from "zod";
import { preferencesSchema } from "@/src/domain/schemas";
import { getEnv } from "@/src/env";
import { ensureSetup } from "@/src/jobs/setup";
import {
  getCredential,
  getInstallation,
  getSeller,
  saveCredential,
  updateInstallation,
  updateSeller,
  upsertInstallation,
} from "@/src/db/repositories";
import { encryptSecret } from "@/src/security/crypto";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

const gongCredentialSchema = z.object({
  baseUrl: z.string().url(),
  accessKey: z.string().min(1),
  accessSecret: z.string().min(1),
});

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  ensureSetup();
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  const form = await request.formData();
  const seller = getSeller(auth.sellerId);
  if (!seller) return new Response("Seller missing", { status: 404 });
  const preferences = preferencesSchema.parse({
    ...JSON.parse(seller.preferencesJson),
    tone: String(form.get("tone") ?? "warm"),
    length: String(form.get("length") ?? "medium"),
    signature: String(form.get("signature") ?? "").slice(0, 1000),
    retentionMode: String(form.get("retentionMode") ?? "days"),
    retentionDays: Number(form.get("retentionDays") ?? 7),
  });
  updateSeller(seller.id, {
    displayName: String(form.get("displayName") ?? seller.displayName).slice(0, 100),
    email: z
      .string()
      .email()
      .parse(String(form.get("email") ?? seller.email)),
    preferencesJson: JSON.stringify(preferences),
  });

  const env = getEnv();
  if (!env.DEMO_MODE) {
    const existingGong = getInstallation(seller.id, "gong");
    const existingOpenRouter = getInstallation(seller.id, "openrouter");
    const gongUserId = String(form.get("gongUserId") ?? seller.gongUserId ?? "").trim();
    const gongInput = {
      baseUrl: String(form.get("gongBaseUrl") ?? "").trim(),
      accessKey: String(form.get("gongAccessKey") ?? "").trim(),
      accessSecret: String(form.get("gongAccessSecret") ?? "").trim(),
    };
    const anyGongSecret = Object.values(gongInput).some(Boolean);
    const needsGongCredential = !existingGong || !getCredential(existingGong.id)?.secretEncrypted;
    const parsedGong = gongCredentialSchema.safeParse(gongInput);
    if ((anyGongSecret || needsGongCredential) && !parsedGong.success) {
      return Response.json(
        { error: "Provide all Gong credential fields when connecting" },
        { status: 400 },
      );
    }
    let gong = existingGong;
    if (!gong) {
      gong = upsertInstallation({
        sellerId: seller.id,
        provider: "gong",
        mode: "real",
        status: gongUserId ? "connected" : "disconnected",
        ...(gongUserId ? { externalAccountId: gongUserId } : {}),
        metadata: parsedGong.success ? { baseUrlHost: new URL(parsedGong.data.baseUrl).host } : {},
      });
    } else {
      const metadata = JSON.parse(gong.metadataJson) as Record<string, unknown>;
      updateInstallation(gong.id, {
        ...(gongUserId ? { externalAccountId: gongUserId, status: "connected" as const } : {}),
        metadataJson: JSON.stringify({
          ...metadata,
          ...(parsedGong.success ? { baseUrlHost: new URL(parsedGong.data.baseUrl).host } : {}),
        }),
      });
    }
    if (parsedGong.success) {
      saveCredential({
        installationId: gong.id,
        secretEncrypted: encryptSecret(JSON.stringify(parsedGong.data), env.MASTER_KEY),
      });
    }
    if (gongUserId) updateSeller(seller.id, { gongUserId });

    const openrouterModel = z
      .string()
      .min(1)
      .parse(String(form.get("openrouterModel") ?? env.OPENROUTER_MODEL).trim());
    const openrouterApiKey = String(form.get("openrouterApiKey") ?? "").trim();
    const needsOpenRouterCredential =
      !existingOpenRouter || !getCredential(existingOpenRouter.id)?.secretEncrypted;
    if (needsOpenRouterCredential && !openrouterApiKey) {
      return Response.json(
        { error: "OpenRouter API key is required for initial setup" },
        { status: 400 },
      );
    }
    let openrouter = existingOpenRouter;
    if (!openrouter) {
      openrouter = upsertInstallation({
        sellerId: seller.id,
        provider: "openrouter",
        mode: "real",
        status: "connected",
        metadata: { model: openrouterModel },
      });
    } else {
      updateInstallation(openrouter.id, {
        metadataJson: JSON.stringify({
          ...(JSON.parse(openrouter.metadataJson) as Record<string, unknown>),
          model: openrouterModel,
        }),
      });
    }
    if (openrouterApiKey) {
      saveCredential({
        installationId: openrouter.id,
        secretEncrypted: encryptSecret(
          JSON.stringify({ apiKey: openrouterApiKey }),
          env.MASTER_KEY,
        ),
      });
    }
  }
  return redirect(request, "/settings");
}
