import type { NormalizedCall } from "@/src/domain/schemas";

export interface GongUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  active: boolean;
}
export interface GongCallPage {
  calls: NormalizedCall[];
  cursor: string | null;
  requestId: string | null;
}

export interface GongAdapter {
  listUsers(): Promise<GongUser[]>;
  listCalls(input: { from: Date; to: Date; cursor?: string }): Promise<GongCallPage>;
  getCall(input: { externalId: string; from: Date; to: Date }): Promise<NormalizedCall>;
  reset?(): void;
}

export class GongError extends Error {
  constructor(
    message: string,
    readonly category: "auth" | "rate_limit" | "not_found" | "provider" | "invalid_response",
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "GongError";
  }
}
