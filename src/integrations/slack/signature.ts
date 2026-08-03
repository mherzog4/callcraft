import { createHmac } from "node:crypto";
import { safeEqual } from "@/src/security/crypto";

export function verifySlackSignature(input: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  signingSecret: string;
  nowSeconds?: number;
}): boolean {
  if (!input.timestamp || !input.signature || !/^v0=[a-f0-9]{64}$/.test(input.signature))
    return false;
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 300) return false;
  const expected = `v0=${createHmac("sha256", input.signingSecret).update(`v0:${input.timestamp}:${input.body}`).digest("hex")}`;
  return safeEqual(expected, input.signature);
}
