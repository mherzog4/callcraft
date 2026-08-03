import { describe, expect, it } from "vitest";
import { SeededGongAdapter } from "@/src/integrations/gong/mock";
import { GongError } from "@/src/integrations/gong/contract";

describe("Gong adapter contract", () => {
  it("paginates realistic calls and links speakers to transcript segments", async () => {
    const adapter = new SeededGongAdapter({ pendingOnce: true });
    const from = new Date("2026-07-01T00:00:00Z"),
      to = new Date("2026-08-01T00:00:00Z");
    const first = await adapter.listCalls({ from, to });
    expect(first.calls).toHaveLength(1);
    expect(first.cursor).toBeTruthy();
    const second = await adapter.listCalls({ from, to, cursor: first.cursor! });
    expect(second.calls).toHaveLength(1);
    const pending = await adapter.getCall({ externalId: second.calls[0]!.externalId, from, to });
    expect(pending.segments).toEqual([]);
    const ready = await adapter.getCall({ externalId: second.calls[0]!.externalId, from, to });
    expect(ready.segments[0]?.speakerName).toBe("Jordan Lee");
    expect(ready.context?.brief).toContain("Northstar");
  });
  it("lists active seller identities for server-side selection", async () => {
    const users = await new SeededGongAdapter().listUsers();
    expect(users).toContainEqual(
      expect.objectContaining({ id: expect.any(String), email: expect.stringContaining("@") }),
    );
  });
  it("supports selectable rate-limit failure simulation", async () => {
    const adapter = new SeededGongAdapter({ failMode: "rate_limit" });
    await expect(adapter.listCalls({ from: new Date(0), to: new Date() })).rejects.toMatchObject({
      category: "rate_limit",
      retryAfterMs: 1000,
    } satisfies Partial<GongError>);
  });
});
