import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./crypto";

export interface SignedState {
  nonce: string;
  expiresAt: number;
  returnTo: string;
  sellerId?: string;
}

export function signState(state: SignedState, secret: string): string {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyState(value: string, secret: string): SignedState {
  const [body, signature] = value.split(".");
  if (!body || !signature) throw new Error("Malformed OAuth state");
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(expected, signature)) throw new Error("Invalid OAuth state");
  let state: SignedState;
  try {
    state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedState;
  } catch {
    throw new Error("Malformed OAuth state");
  }
  if (
    typeof state.nonce !== "string" ||
    typeof state.expiresAt !== "number" ||
    typeof state.returnTo !== "string" ||
    !state.returnTo.startsWith("/") ||
    state.returnTo.startsWith("//")
  )
    throw new Error("Invalid OAuth state payload");
  if (state.expiresAt < Date.now()) throw new Error("Expired OAuth state");
  return state;
}

export function newOAuthState(returnTo = "/settings", sellerId?: string): SignedState {
  return {
    nonce: randomBytes(16).toString("hex"),
    expiresAt: Date.now() + 10 * 60_000,
    returnTo,
    ...(sellerId ? { sellerId } : {}),
  };
}
