import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/src/security/crypto";
import { newOAuthState, signState, verifyState } from "@/src/security/signing";
import { verifySlackSignature } from "@/src/integrations/slack/signature";
import { createSession, readSession } from "@/src/security/session";
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
});
