import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/src/security/crypto";
import { newOAuthState, signState, verifyState } from "@/src/security/signing";
import { verifySlackSignature } from "@/src/integrations/slack/signature";
import { createSession, readSession } from "@/src/security/session";
import { enforceRateLimit, resetRateLimits } from "@/src/security/rate-limit";
import { requireSameOrigin } from "@/src/web/request";

describe("credential and request security", () => {
  it("encrypts with authenticated encryption and rejects a wrong key", () => {
    const encrypted = encryptSecret("top-secret", "a".repeat(32));
    expect(encrypted).not.toContain("top-secret");
    expect(decryptSecret(encrypted, "a".repeat(32))).toBe("top-secret");
    expect(() => decryptSecret(encrypted, "b".repeat(32))).toThrow();
  });
  it("signs and verifies expiring OAuth state", () => {
    const state = newOAuthState("/settings", "seller-1");
    const token = signState(state, "s".repeat(32));
    expect(verifyState(token, "s".repeat(32))).toMatchObject({
      nonce: state.nonce,
      sellerId: "seller-1",
    });
    expect(() => verifyState(`${token}x`, "s".repeat(32))).toThrow();
  });
  it("rejects malformed sessions and mutation requests without exact Origin", () => {
    const secret = "s".repeat(32);
    const session = createSession("seller-1", secret);
    expect(readSession(session, secret)).toBe("seller-1");
    expect(readSession("garbage.value", secret)).toBeNull();
    expect(
      requireSameOrigin(new Request("http://localhost:3000/api/setup", { method: "POST" })),
    ).not.toBeNull();
    expect(
      requireSameOrigin(
        new Request("http://localhost:3000/api/setup", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).toBeNull();
  });
  it("verifies Slack signatures and rejects stale replay", () => {
    const body = "payload=%7B%7D";
    const timestamp = "1700000000";
    const secret = "signing";
    const signature = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
    expect(
      verifySlackSignature({
        body,
        timestamp,
        signature,
        signingSecret: secret,
        nowSeconds: 1700000000,
      }),
    ).toBe(true);
    expect(
      verifySlackSignature({
        body,
        timestamp,
        signature,
        signingSecret: secret,
        nowSeconds: 1700000400,
      }),
    ).toBe(false);
  });
  it("bounds each key independently and rejects without revealing the key", () => {
    resetRateLimits();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(enforceRateLimit("send:seller-1", 3)).toBeUndefined();
    }
    const rejected = enforceRateLimit("send:seller-1", 3);
    expect(rejected?.status).toBe(429);
    expect(enforceRateLimit("send:seller-2", 3)).toBeUndefined();
    expect(enforceRateLimit("sync:seller-1", 3)).toBeUndefined();
  });
  // The two halves use different windows on purpose. Rejection is asserted
  // under a window long enough that no scheduling delay can expire it, and
  // release is asserted under a window short enough that any real delay
  // exceeds it. Sharing one short window made rejection depend on the test
  // running faster than its own limit.
  it("rejects within the window and releases the key after it elapses", async () => {
    resetRateLimits();
    expect(enforceRateLimit("setup:seller-1", 1, 60_000)).toBeUndefined();
    expect(enforceRateLimit("setup:seller-1", 1, 60_000)?.status).toBe(429);

    expect(enforceRateLimit("setup:seller-2", 1, 1)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(enforceRateLimit("setup:seller-2", 1, 1)).toBeUndefined();
  });
});
