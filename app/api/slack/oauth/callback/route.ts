import { NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { z } from "zod";
import { getEnv } from "@/src/env";
import { verifyState } from "@/src/security/signing";
import { createSession } from "@/src/security/session";
import { encryptSecret } from "@/src/security/crypto";
import {
  getSeller,
  getSellerBySlack,
  saveCredential,
  updateSeller,
  upsertInstallation,
  upsertSeller,
} from "@/src/db/repositories";
import { ensureSetup } from "@/src/jobs/setup";

const responseSchema = z.object({
  ok: z.literal(true),
  access_token: z.string(),
  team: z.object({ id: z.string(), name: z.string().optional() }),
  authed_user: z.object({ id: z.string() }),
});

function cookieValue(request: Request, name: string): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function GET(request: Request) {
  ensureSetup();
  const env = getEnv();
  if (env.DEMO_MODE) return new Response("Real OAuth is disabled in demo mode", { status: 403 });
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const cookie = cookieValue(request, "oauth_state");
  if (!cookie || cookie !== state) return new Response("OAuth state mismatch", { status: 403 });
  const verified = verifyState(state, env.SESSION_SECRET);
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET)
    return new Response("Slack not configured", { status: 400 });
  const raw = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "",
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: `${env.APP_URL}/api/slack/oauth/callback`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const parsed = responseSchema.parse(await raw.json());
  const identity = await new WebClient(parsed.access_token).users.info({
    user: parsed.authed_user.id,
  });
  const profile = identity.user?.profile;
  const email = profile?.email;
  if (!email) return new Response("Slack identity did not include an email", { status: 400 });

  const alreadyLinked = getSellerBySlack(parsed.team.id, parsed.authed_user.id);
  if (verified.sellerId && alreadyLinked && alreadyLinked.id !== verified.sellerId)
    return new Response("Slack identity is linked to another seller", { status: 409 });
  const initiatedSeller = verified.sellerId ? getSeller(verified.sellerId) : undefined;
  if (verified.sellerId && !initiatedSeller)
    return new Response("Initiating seller no longer exists", { status: 409 });
  const seller =
    initiatedSeller ??
    alreadyLinked ??
    upsertSeller({
      email,
      displayName: profile.real_name || identity.user?.real_name || email,
    });
  updateSeller(seller.id, {
    email,
    displayName: profile.real_name || seller.displayName,
    slackTeamId: parsed.team.id,
    slackUserId: parsed.authed_user.id,
  });
  const install = upsertInstallation({
    sellerId: seller.id,
    provider: "slack",
    mode: "real",
    externalAccountId: parsed.authed_user.id,
    metadata: { teamId: parsed.team.id, teamName: parsed.team.name },
  });
  saveCredential({
    installationId: install.id,
    accessTokenEncrypted: encryptSecret(parsed.access_token, env.MASTER_KEY),
    scopes: "chat:write im:write users:read users:read.email",
  });
  const response = NextResponse.redirect(new URL(verified.returnTo, request.url));
  response.cookies.set("session", createSession(seller.id, env.SESSION_SECRET), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400,
  });
  response.cookies.delete("oauth_state");
  return response;
}
