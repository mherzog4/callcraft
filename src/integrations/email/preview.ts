import fs from "node:fs/promises";
import path from "node:path";
import { buildMime } from "./mime";
import type { EmailSender, SendEmailInput, SendEmailResult } from "./types";

export class PreviewEmailSender implements EmailSender {
  constructor(private readonly directory = "./data/previews") {}
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    await fs.mkdir(this.directory, { recursive: true });
    const previewPath = path.join(this.directory, `email-${input.intentId}.eml`);
    await fs.writeFile(previewPath, await buildMime(input.from, input.draft, input.intentId));
    return {
      messageId: `preview-${input.intentId}`,
      threadId: null,
      acceptedAt: new Date(),
      previewPath,
    };
  }
}
