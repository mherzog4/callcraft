import { z } from "zod";
import { attachSeededGong } from "@/src/demo/seed";
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
import { isDemoMode, isEvaluationMode } from "@/src/runtime/policy";
import { encryptSecret } from "@/src/security/crypto";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

const gongCredentialSchema = z.object({
  baseUrl: z.string().url(),
  accessKey: z.string().min(1),
  accessSecret: z.string().min(1),
});

function parseStoredObject(value: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} is not an object`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} is malformed`, { cause: error });
  }
}

function hostForUrl(value: string): string {
  try {
    return new URL(value).host;
  } catch (error) {
    throw new Error("Gong base URL is invalid", { cause: error });
  }
}

function configureRealGong(
  seller: NonNullable<ReturnType<typeof getSeller>>,
  form: FormData,
): string | null {
  const env = getEnv();
  const existing = getInstallation(seller.id, "gong");
  const gongUserId = String(form.get("gongUserId") ?? seller.gongUserId ?? "").trim();
  const input = {
    baseUrl: String(form.get("gongBaseUrl") ?? "").trim(),
    accessKey: String(form.get("gongAccessKey") ?? "").trim(),
    accessSecret: String(form.get("gongAccessSecret") ?? "").trim(),
  };
  const anySecret = Object.values(input).some(Boolean);
  const needsCredential = !existing || !getCredential(existing.id)?.secretEncrypted;
  const parsed = gongCredentialSchema.safeParse(input);
  if ((anySecret || needsCredential) && !parsed.success) {
    return "Provide all Gong credential fields when connecting";
  }

  let gong = existing;
  if (!gong) {
    gong = upsertInstallation({
      sellerId: seller.id,
      provider: "gong",
      mode: "real",
      status: gongUserId ? "connected" : "disconnected",
      ...(gongUserId ? { externalAccountId: gongUserId } : {}),
      metadata: parsed.success ? { baseUrlHost: hostForUrl(parsed.data.baseUrl) } : {},
    });
  } else {
    const metadata = parseStoredObject(gong.metadataJson, "Gong installation metadata");
    updateInstallation(gong.id, {
      ...(gongUserId ? { externalAccountId: gongUserId, status: "connected" as const } : {}),
      metadataJson: JSON.stringify({
        ...metadata,
        ...(parsed.success ? { baseUrlHost: hostForUrl(parsed.data.baseUrl) } : {}),
      }),
    });
  }
  if (parsed.success) {
    saveCredential({
      installationId: gong.id,
      secretEncrypted: encryptSecret(JSON.stringify(parsed.data), env.MASTER_KEY),
    });
  }
  if (gongUserId) updateSeller(seller.id, { gongUserId });
  return null;
}

function configureOpenRouter(
  seller: NonNullable<ReturnType<typeof getSeller>>,
  form: FormData,
): string | null {
  const env = getEnv();
  const existing = getInstallation(seller.id, "openrouter");
  const model = z
    .string()
    .min(1)
    .parse(String(form.get("openrouterModel") ?? env.OPENROUTER_MODEL).trim());
  const apiKey = String(form.get("openrouterApiKey") ?? "").trim();
  const needsCredential = !existing || !getCredential(existing.id)?.secretEncrypted;
  if (needsCredential && !apiKey) return "OpenRouter API key is required for initial setup";

  let openrouter = existing;
  if (!openrouter) {
    openrouter = upsertInstallation({
      sellerId: seller.id,
      provider: "openrouter",
      mode: "real",
      status: "connected",
      metadata: { model },
    });
  } else {
    updateInstallation(openrouter.id, {
      status: "connected",
      metadataJson: JSON.stringify({
        ...parseStoredObject(openrouter.metadataJson, "OpenRouter installation metadata"),
        model,
      }),
    });
  }
  if (apiKey) {
    saveCredential({
      installationId: openrouter.id,
      secretEncrypted: encryptSecret(JSON.stringify({ apiKey }), env.MASTER_KEY),
    });
  }
  return null;
}

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
    ...parseStoredObject(seller.preferencesJson, "Seller preferences"),
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

  const appMode = getEnv().APP_MODE;
  if (!isDemoMode(appMode)) {
    if (isEvaluationMode(appMode)) attachSeededGong(seller.id);
    else {
      const gongError = configureRealGong(seller, form);
      if (gongError) return Response.json({ error: gongError }, { status: 400 });
    }
    const openRouterError = configureOpenRouter(seller, form);
    if (openRouterError) return Response.json({ error: openRouterError }, { status: 400 });
  }
  return redirect(request, "/settings");
}
