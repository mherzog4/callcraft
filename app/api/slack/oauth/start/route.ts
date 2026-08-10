import { NextResponse } from "next/server";
import { getEnv } from "@/src/env";
import { newOAuthState, signState } from "@/src/security/signing";
import { allowsRealOAuth } from "@/src/runtime/policy";
import { sellerIdFromRequest } from "@/src/web/auth";

// Deliberately not rate limited: this handler signs state and redirects without
// touching a provider, the database, or the model. The expensive half of the
// flow is the callback, which requires a signed, short-lived state to proceed.
export function GET(request: Request) {
  const env = getEnv();
  if (!allowsRealOAuth(env.APP_MODE))
    return NextResponse.redirect(
      new URL("/settings?error=real_oauth_disabled_in_demo", request.url),
    );
  if (!env.SLACK_CLIENT_ID)
    return NextResponse.redirect(new URL("/settings?error=slack_not_configured", request.url));
  const state = signState(
    newOAuthState("/settings", sellerIdFromRequest(request) ?? undefined),
    env.SESSION_SECRET,
  );
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: "chat:write,im:write,users:read,users:read.email",
    redirect_uri: `${env.APP_URL}/api/slack/oauth/callback`,
    state,
  });
  const response = NextResponse.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
