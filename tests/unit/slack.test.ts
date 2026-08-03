import { describe, expect, it } from "vitest";
import { renderDraftBlocks, sendConfirmationModal } from "@/src/integrations/slack/render";
import { scheduleSlackOperation } from "@/src/integrations/slack/deferred";
import { vi } from "vitest";

const draft = {
  to: ["buyer@example.org"],
  cc: ["legal@example.org"],
  subject: "*Exact* <subject> & value",
  body: "A".repeat(7000),
};
const summary = {
  participants: [],
  pains: [],
  decisions: [],
  objections: [],
  commitments: [],
  nextSteps: [],
  evidence: [{ claim: "Call occurred", segmentIds: ["segment-1"] }],
  uncertainty: [],
};

describe("Slack review safety", () => {
  it("shows the exact sender, To, Cc, subject, and complete body before submit", () => {
    const modal = sendConfirmationModal("draft-1", "seller@example.com", draft);
    const serialized = JSON.stringify(modal);
    expect(serialized).toContain("seller@example.com");
    expect(serialized).toContain("buyer@example.org");
    expect(serialized).toContain("legal@example.org");
    expect(serialized).toContain("*Exact* <subject> & value");
    const fields = modal.blocks.slice(0, 4);
    expect(fields.every((block) => "text" in block && block.text?.type === "plain_text")).toBe(
      true,
    );
    expect("text" in fields[3]! ? fields[3].text?.text : "").toBe(
      "Subject\n*Exact* <subject> & value",
    );
    const divider = modal.blocks.findIndex((block) => block.type === "divider");
    const bodyParts = modal.blocks
      .slice(divider + 1)
      .filter((block) => block.type === "section" && "text" in block)
      .map((block) => ("text" in block ? block.text?.text : ""))
      .join("");
    expect(bodyParts).toBe(draft.body);
  });
  it("acknowledges before running a deferred Slack provider operation", async () => {
    const open = vi.fn().mockResolvedValue({ ok: true });
    let deferred: (() => Promise<void>) | undefined;
    scheduleSlackOperation(
      open,
      (task) => {
        deferred = task;
      },
      () => undefined,
    );
    expect(open).not.toHaveBeenCalled();
    await deferred!();
    expect(open).toHaveBeenCalledOnce();
  });
  it("removes the send action after a terminal or ambiguous send state", () => {
    const blocks = renderDraftBlocks({
      callId: "call-1",
      draftId: "draft-1",
      title: "Call",
      gongUrl: "https://app.gong.io/call?id=1",
      context: null,
      summary,
      draft,
      allowSend: false,
      status: "Submitted via Gmail",
    });
    expect(JSON.stringify(blocks)).not.toContain('"action_id":"send_email"');
  });
});
