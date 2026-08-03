import type {
  CallSummary,
  EmailDraft,
  GongContext,
  Participant,
  SellerPreferences,
  TranscriptSegment,
} from "@/src/domain/schemas";

export interface GenerationResult<T> {
  value: T;
  usage: Record<string, number>;
  modelId: string;
  requestId?: string;
  provider?: string;
}
export interface Generator {
  extract(input: {
    segments: TranscriptSegment[];
    participants: Participant[];
    context: GongContext | null;
  }): Promise<GenerationResult<CallSummary>>;
  compose(input: {
    summary: CallSummary;
    participants: Participant[];
    preferences: SellerPreferences;
    callTitle: string;
  }): Promise<GenerationResult<EmailDraft>>;
}
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly category: "auth" | "rate_limit" | "timeout" | "invalid_output" | "provider",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
