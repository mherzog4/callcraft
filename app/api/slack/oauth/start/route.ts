import { NextResponse } from "next/server";
import { getEnv } from "@/src/env";
import { newOAuthState, signState } from "@/src/security/signing";
import { sellerIdFromRequest } from "@/src/web/auth";
export function GET(request: Request) {
  const env = getEnv();
  if (env.DEMO_MODE)
    return NextResponse.redirect(
      new URL("/settings?error=real_oauth_disabled_in_demo", request.url),
    );
  if (!env.SLACK_CLIENT_ID)
    return NextResponse.redirect(new URL("/settings?error=slack_not_configured", request.url));
  const state = signState(
    newOAuthState("/settings", sellerIdFromRequest(request) ?? undefined),
    env.SESSION_SECRET,
  );
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", env.SLACK_CLIENT_ID);
  url.searchParams.set("scope", "chat:write,im:write,users:read,users:read.email");
  url.searchParams.set("redirect_uri", `${env.APP_URL}/api/slack/oauth/callback`);
  url.searchParams.set("state", state);
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
