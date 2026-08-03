import { getEnv } from "@/src/env";
import {
  getCredential,
  getInstallation,
  saveCredential,
  upsertInstallation,
} from "@/src/db/repositories";
import { decryptSecret } from "@/src/security/crypto";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  const install = getInstallation(auth.sellerId, "google");
  if (install?.mode === "real") {
    const credential = getCredential(install.id);
    if (credential?.accessTokenEncrypted) {
      const token = decryptSecret(credential.accessTokenEncrypted, getEnv().MASTER_KEY);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
    }
    saveCredential({ installationId: install.id });
    upsertInstallation({
      sellerId: auth.sellerId,
      provider: "google",
      mode: "real",
      status: "disconnected",
    });
  }
  return redirect(request, "/settings");
}
