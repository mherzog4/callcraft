import type { EmailDraft } from "@/src/domain/schemas";
export interface SendEmailInput {
  intentId: string;
  from: string;
  draft: EmailDraft;
}
export interface SendEmailResult {
  messageId: string;
  threadId: string | null;
  acceptedAt: Date;
  previewPath?: string;
}
export interface EmailSender {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly category: "auth" | "invalid_recipient" | "rejected" | "unknown",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}
