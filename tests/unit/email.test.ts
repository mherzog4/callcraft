import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PreviewEmailSender } from "@/src/integrations/email/preview";

describe("preview email sender", () => {
  it("builds a non-networked RFC 5322 MIME preview", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "callcraft-email-"));
    const sender = new PreviewEmailSender(directory);
    const result = await sender.send({
      intentId: "intent-1",
      from: "seller@example.com",
      draft: { to: ["buyer@example.org"], cc: [], subject: "Next steps", body: "Hello\n\nThanks." },
    });
    const mime = await fs.readFile(result.previewPath!, "utf8");
    expect(mime).toMatch(/Subject: Next steps/);
    expect(mime).toContain("buyer@example.org");
    expect(mime).toContain("Message-ID: <callcraft-intent-1@callcraft.invalid>");
    expect(mime).toContain("X-CallCraft-Intent: intent-1");
    expect(result.messageId).toBe("preview-intent-1");
  });
});
