import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

export function createSession(sellerId: string, secret: string, maxAgeSeconds = 86400): string {
  const payload = Buffer.from(
    JSON.stringify({ sellerId, exp: Date.now() + maxAgeSeconds * 1000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function readSession(cookie: string | undefined, secret: string): string | null {
  if (!cookie) return null;
  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(expected, signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sellerId?: unknown;
      exp?: unknown;
    };
    return typeof parsed.sellerId === "string" &&
      typeof parsed.exp === "number" &&
      parsed.exp > Date.now()
      ? parsed.sellerId
      : null;
  } catch {
    return null;
  }
}
