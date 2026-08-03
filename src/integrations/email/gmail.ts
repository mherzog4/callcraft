import { google } from "googleapis";
import { buildMime } from "./mime";
import type { EmailSender, SendEmailInput, SendEmailResult } from "./types";
import { EmailSendError } from "./types";

export class GmailSender implements EmailSender {
  constructor(
    private readonly options: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      accessToken?: string;
      refreshToken?: string;
    },
  ) {}
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const auth = new google.auth.OAuth2(
      this.options.clientId,
      this.options.clientSecret,
      this.options.redirectUri,
    );
    auth.setCredentials({
      ...(this.options.accessToken ? { access_token: this.options.accessToken } : {}),
      ...(this.options.refreshToken ? { refresh_token: this.options.refreshToken } : {}),
    });
    try {
      const mime = await buildMime(input.from, input.draft, input.intentId);
      const result = await google
        .gmail({ version: "v1", auth })
        .users.messages.send({ userId: "me", requestBody: { raw: mime.toString("base64url") } });
      if (!result.data.id)
        throw new EmailSendError("Gmail accepted no message identifier", "unknown", false);
      return {
        messageId: result.data.id,
        threadId: result.data.threadId ?? null,
        acceptedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof EmailSendError) throw error;
      const status = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
      if (status === 401 || status === 403)
        throw new EmailSendError("Gmail authorization was revoked or rejected", "auth", false);
      if (status >= 400 && status < 500)
        throw new EmailSendError("Gmail rejected the message", "rejected", false);
      throw new EmailSendError(
        "Gmail outcome is unknown; reconcile before retrying",
        "unknown",
        false,
      );
    }
  }
}
