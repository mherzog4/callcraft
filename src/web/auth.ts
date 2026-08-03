import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getSeller } from "@/src/db/repositories";
import { DEMO_SELLER_ID } from "@/src/demo/seed";
import { getEnv } from "@/src/env";
import { readSession } from "@/src/security/session";

function cookieValue(header: string | null, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function sellerIdFromRequest(request: Request): string | null {
  const env = getEnv();
  const signed = readSession(
    cookieValue(request.headers.get("cookie"), "session"),
    env.SESSION_SECRET,
  );
  if (signed && getSeller(signed)) return signed;
  if (env.DEMO_MODE && getSeller(DEMO_SELLER_ID)) return DEMO_SELLER_ID;
  return null;
}

export function requireSeller(request: Request): { sellerId: string } | { response: NextResponse } {
  const sellerId = sellerIdFromRequest(request);
  return sellerId
    ? { sellerId }
    : { response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
}

export async function currentSellerId(): Promise<string> {
  const env = getEnv();
  const store = await cookies();
  const signed = readSession(store.get("session")?.value, env.SESSION_SECRET);
  if (signed && getSeller(signed)) return signed;
  if (env.DEMO_MODE && getSeller(DEMO_SELLER_ID)) return DEMO_SELLER_ID;
  redirect("/api/slack/oauth/start");
}

export function assertDemoIsolation(mode: "demo" | "real"): void {
  if (getEnv().DEMO_MODE && mode !== "demo") {
    throw new Error("Real provider access is disabled while DEMO_MODE=true");
  }
}
