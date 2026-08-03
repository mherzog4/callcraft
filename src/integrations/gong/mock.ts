import type { GongAdapter, GongCallPage, GongUser } from "./contract";
import { GongError } from "./contract";
import type { NormalizedCall } from "@/src/domain/schemas";
import { demoCalls, demoContext, demoParties, demoSegments, demoUsers } from "./fixtures";

export class SeededGongAdapter implements GongAdapter {
  private transcriptAttempts = new Map<string, number>();
  constructor(
    private readonly options: { pendingOnce?: boolean; failMode?: "rate_limit" | "provider" } = {
      pendingOnce: true,
    },
  ) {}

  async listUsers(): Promise<GongUser[]> {
    return structuredClone(demoUsers);
  }
  async listCalls(input: { from: Date; to: Date; cursor?: string }): Promise<GongCallPage> {
    if (this.options.failMode)
      throw new GongError(
        `Simulated Gong ${this.options.failMode}`,
        this.options.failMode,
        this.options.failMode === "rate_limit" ? 1_000 : 5_000,
      );
    const page = input.cursor ? demoCalls.slice(1) : demoCalls.slice(0, 1);
    return {
      calls: page.map((call) => ({
        ...structuredClone(call),
        participants: [],
        context: null,
        segments: [],
        providerRequestId: `demo-list-${input.cursor ? 2 : 1}`,
      })),
      cursor: input.cursor ? null : "demo-cursor-page-2",
      requestId: `demo-list-${input.cursor ? 2 : 1}`,
    };
  }
  async getCall(input: { externalId: string; from: Date; to: Date }): Promise<NormalizedCall> {
    if (this.options.failMode)
      throw new GongError(
        `Simulated Gong ${this.options.failMode}`,
        this.options.failMode,
        this.options.failMode === "rate_limit" ? 1_000 : 5_000,
      );
    const base = demoCalls.find((call) => call.externalId === input.externalId);
    if (!base) throw new Error("Demo call not found");
    const count = this.transcriptAttempts.get(input.externalId) ?? 0;
    this.transcriptAttempts.set(input.externalId, count + 1);
    const pending = this.options.pendingOnce && input.externalId.endsWith("96") && count === 0;
    return {
      ...structuredClone(base),
      participants: structuredClone(demoParties),
      context: structuredClone(demoContext),
      segments: pending
        ? []
        : structuredClone(demoSegments).map((segment) => ({
            ...segment,
            id: `${input.externalId}:${segment.id}`,
          })),
      providerRequestId: `demo-detail-${input.externalId}-${count + 1}`,
    };
  }
  reset(): void {
    this.transcriptAttempts.clear();
  }
}
