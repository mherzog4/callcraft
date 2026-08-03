import { getEnv } from "@/src/env";
import {
  getCredential,
  getInstallation,
  saveCredential,
  upsertInstallation,
} from "@/src/db/repositories";
import { allowsRealOAuth, assertProviderMode } from "@/src/runtime/policy";
import { decryptSecret } from "@/src/security/crypto";
import { requireSeller } from "@/src/web/auth";
import { requireSameOrigin, redirect } from "@/src/web/request";

async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Revocation is best effort; local credential removal still disconnects the account.
  }
}

export async function POST(request: Request) {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!allowsRealOAuth(getEnv().APP_MODE))
    return new Response("Real OAuth is disabled in demo mode", { status: 403 });
  const auth = requireSeller(request);
  if ("response" in auth) return auth.response;
  const install = getInstallation(auth.sellerId, "google");
  if (install?.mode === "real") {
    assertProviderMode("google", install.mode);
    const credential = getCredential(install.id);
    if (credential?.accessTokenEncrypted) {
      const token = decryptSecret(credential.accessTokenEncrypted, getEnv().MASTER_KEY);
      await revokeToken(token);
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
