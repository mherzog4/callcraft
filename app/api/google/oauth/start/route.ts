import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getEnv } from "@/src/env";
import { newOAuthState, signState } from "@/src/security/signing";
import { sellerIdFromRequest } from "@/src/web/auth";
export function GET(request: Request) {
  const env = getEnv();
  if (env.DEMO_MODE)
    return NextResponse.redirect(
      new URL("/settings?error=real_oauth_disabled_in_demo", request.url),
    );
  const sellerId = sellerIdFromRequest(request);
  if (!sellerId) return NextResponse.redirect(new URL("/api/slack/oauth/start", request.url));
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    return NextResponse.redirect(new URL("/settings?error=google_not_configured", request.url));
  const state = signState(newOAuthState("/settings", sellerId), env.SESSION_SECRET);
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.APP_URL}/api/google/oauth/callback`,
  );
  const url = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state,
    scope: ["openid", "email", "https://www.googleapis.com/auth/gmail.send"],
  });
  const response = NextResponse.redirect(url);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
