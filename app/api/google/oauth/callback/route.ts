import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getEnv } from "@/src/env";
import { verifyState } from "@/src/security/signing";
import { readSession } from "@/src/security/session";
import { encryptSecret } from "@/src/security/crypto";
import { saveCredential, upsertInstallation } from "@/src/db/repositories";
import { getSeller } from "@/src/db/repositories";
export async function GET(request: Request) {
  const env = getEnv();
  if (env.DEMO_MODE) return new Response("Real OAuth is disabled in demo mode", { status: 403 });
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const cookie = request.headers.get("cookie")?.match(/(?:^|; )oauth_state=([^;]+)/)?.[1];
  if (!cookie || cookie !== state) return new Response("OAuth state mismatch", { status: 403 });
  const verified = verifyState(state, env.SESSION_SECRET);
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    return new Response("Google not configured", { status: 400 });
  const auth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.APP_URL}/api/google/oauth/callback`,
  );
  const { tokens } = await auth.getToken(url.searchParams.get("code") ?? "");
  auth.setCredentials(tokens);
  const identity = await google.oauth2({ version: "v2", auth }).userinfo.get();
  if (!identity.data.email)
    return new Response("Google did not return email identity", { status: 400 });
  const sessionCookie = request.headers.get("cookie")?.match(/(?:^|; )session=([^;]+)/)?.[1];
  const sellerId = readSession(sessionCookie, env.SESSION_SECRET);
  if (!sellerId || !verified.sellerId || sellerId !== verified.sellerId || !getSeller(sellerId))
    return new Response("OAuth seller binding mismatch", { status: 403 });
  const install = upsertInstallation({
    sellerId,
    provider: "google",
    mode: "real",
    externalAccountId: identity.data.email,
    metadata: { email: identity.data.email },
  });
  saveCredential({
    installationId: install.id,
    ...(tokens.access_token
      ? { accessTokenEncrypted: encryptSecret(tokens.access_token, env.MASTER_KEY) }
      : {}),
    ...(tokens.refresh_token
      ? { refreshTokenEncrypted: encryptSecret(tokens.refresh_token, env.MASTER_KEY) }
      : {}),
    ...(tokens.expiry_date ? { expiresAt: new Date(tokens.expiry_date) } : {}),
    scopes: tokens.scope ?? "openid email gmail.send",
  });
  const response = NextResponse.redirect(new URL("/settings", request.url));
  response.cookies.delete("oauth_state");
  return response;
}
