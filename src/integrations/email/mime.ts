import nodemailer from "nodemailer";
import type { EmailDraft } from "@/src/domain/schemas";

export async function buildMime(
  from: string,
  draft: EmailDraft,
  intentId?: string,
): Promise<Buffer> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "unix",
  });
  const result = await transport.sendMail({
    from,
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject,
    text: draft.body,
    ...(intentId ? { messageId: `<callcraft-${intentId}@callcraft.invalid>` } : {}),
    headers: {
      "X-Gong-Follow-Up": "oss",
      ...(intentId ? { "X-CallCraft-Intent": intentId } : {}),
    },
  });
  if (!Buffer.isBuffer(result.message)) throw new Error("MIME composer did not return a buffer");
  // Nodemailer normalizes custom-header casing. Preserve the public intent
  // header's documented spelling for downstream audit tooling.
  return Buffer.from(
    result.message.toString("utf8").replace("X-Callcraft-Intent:", "X-CallCraft-Intent:"),
    "utf8",
  );
}
