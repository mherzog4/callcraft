import { hasReservedExampleRecipients } from "@/src/domain/email-safety";
import type { CallSummary, EmailDraft, GongContext, TranscriptSegment } from "@/src/domain/schemas";

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `• ${item}`).join("\n") : "Not available";
}
function chunks(value: string, size = 2800): string[] {
  const result: string[] = [];
  for (let offset = 0; offset < value.length; offset += size)
    result.push(value.slice(offset, offset + size));
  return result.length ? result : [""];
}

export function renderDraftBlocks(input: {
  callId: string;
  draftId: string;
  title: string;
  gongUrl: string;
  synthetic?: boolean;
  context: GongContext | null;
  summary: CallSummary;
  draft: EmailDraft;
  status?: string;
  allowSend?: boolean;
}) {
  const contextLabel = input.synthetic
    ? "Seeded Gong context — synthetic data"
    : input.context?.brief
      ? "Gong context"
      : "Generated context";
  const contextText =
    input.context?.brief ??
    [...input.summary.pains, ...input.summary.decisions, ...input.summary.nextSteps]
      .slice(0, 4)
      .join("\n");
  const details = input.context
    ? ([input.context.outcome, ...input.context.keyPoints].filter(Boolean) as string[])
    : input.summary.nextSteps;
  const hasReservedRecipients = hasReservedExampleRecipients(input.draft);
  const actions: Record<string, unknown>[] = [
    {
      type: "button",
      action_id: "edit_draft",
      text: { type: "plain_text", text: "Edit" },
      value: input.draftId,
    },
    {
      type: "button",
      action_id: "regenerate_draft",
      text: { type: "plain_text", text: "Regenerate" },
      value: input.callId,
    },
    {
      type: "button",
      action_id: "view_evidence",
      text: { type: "plain_text", text: "View context" },
      value: input.callId,
    },
  ];
  if (!input.synthetic) {
    actions.push({
      type: "button",
      action_id: "open_gong",
      text: { type: "plain_text", text: "Open in Gong" },
      url: input.gongUrl,
    });
  }
  if (input.allowSend !== false && !hasReservedRecipients) {
    actions.push({
      type: "button",
      style: "primary",
      action_id: "send_email",
      text: { type: "plain_text", text: "Send email" },
      value: input.draftId,
    });
  }
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${input.synthetic ? "SYNTHETIC · " : ""}Follow-up: ${input.title}`.slice(0, 150),
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${contextLabel}*\n${contextText || "No summary available"}\n${bullets(details.slice(0, 4))}`,
      },
    },
    { type: "divider" },
    ...(hasReservedRecipients
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ":warning: *Reserved example recipient.* Use *Edit* to replace To/Cc with an address you own before Send email is enabled.",
            },
          },
        ]
      : []),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${input.draft.to.join(", ")}\n*Cc:* ${input.draft.cc.join(", ") || "None"}\n*Subject:* ${input.draft.subject}\n\n${input.draft.body}`.slice(
          0,
          2990,
        ),
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${input.synthetic ? "Synthetic call fixture · " : ""}Status: *${input.status ?? "Ready for review"}* · Email is never sent automatically.`,
        },
      ],
    },
    { type: "actions", block_id: `draft:${input.draftId}`, elements: actions },
  ];
}

export function sendConfirmationModal(draftId: string, sender: string, draft: EmailDraft) {
  return {
    type: "modal",
    callback_id: "send_email_submit",
    private_metadata: JSON.stringify({ draftId, sender }),
    title: { type: "plain_text", text: "Confirm email" },
    submit: { type: "plain_text", text: "Send via Gmail" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      ...[
        { label: "From", value: sender, blockId: "confirm_from" },
        { label: "To", value: draft.to.join(", "), blockId: "confirm_to" },
        { label: "Cc", value: draft.cc.join(", ") || "None", blockId: "confirm_cc" },
        { label: "Subject", value: draft.subject, blockId: "confirm_subject" },
      ].map(({ label, value, blockId }) => ({
        type: "section",
        block_id: blockId,
        text: { type: "plain_text", text: `${label}\n${value}` },
      })),
      { type: "divider" },
      ...chunks(draft.body).map((part) => ({
        type: "section",
        text: { type: "plain_text", text: part || " " },
      })),
      {
        type: "context",
        elements: [
          {
            type: "plain_text",
            text: "The From, To, Cc, subject, and complete body above are the exact immutable revision that will be submitted. This cannot be undone.",
          },
        ],
      },
    ],
  };
}

export function evidenceModal(input: {
  callId: string;
  context: GongContext | null;
  summary: CallSummary;
  segments: TranscriptSegment[];
}) {
  const byId = new Map(input.segments.map((segment) => [segment.id, segment]));
  const evidence = input.summary.evidence
    .map((item) => {
      const citations = item.segmentIds
        .map((id) => {
          const segment = byId.get(id);
          return segment
            ? `${id} · ${segment.speakerName} @ ${Math.floor(segment.startMs / 1000)}s\n${segment.text}`
            : `${id} · unavailable`;
        })
        .join("\n\n");
      return `${item.claim}\n${citations}`;
    })
    .join("\n\n——\n\n");
  const gong = input.context
    ? `Gong brief: ${input.context.brief ?? "Unavailable"}\nOutcome: ${input.context.outcome ?? "Unavailable"}\nKey points: ${input.context.keyPoints.join("; ") || "Unavailable"}`
    : "Gong analysis unavailable; generated context shown.";
  return {
    type: "modal",
    callback_id: "view_evidence_modal",
    private_metadata: input.callId,
    title: { type: "plain_text", text: "Context & evidence" },
    close: { type: "plain_text", text: "Close" },
    blocks: [
      ...chunks(gong).map((part) => ({
        type: "section",
        text: { type: "plain_text", text: part },
      })),
      { type: "divider" },
      ...chunks(evidence || "No evidence available").map((part) => ({
        type: "section",
        text: { type: "plain_text", text: part },
      })),
    ],
  };
}

export function editDraftModal(draftId: string, draft: EmailDraft) {
  return {
    type: "modal",
    callback_id: "edit_draft_submit",
    private_metadata: draftId,
    title: { type: "plain_text", text: "Edit follow-up" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "to",
        label: { type: "plain_text", text: "To (comma separated)" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          initial_value: draft.to.join(", "),
        },
      },
      {
        type: "input",
        optional: true,
        block_id: "cc",
        label: { type: "plain_text", text: "Cc (comma separated)" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          initial_value: draft.cc.join(", "),
        },
      },
      {
        type: "input",
        block_id: "subject",
        label: { type: "plain_text", text: "Subject" },
        element: { type: "plain_text_input", action_id: "value", initial_value: draft.subject },
      },
      {
        type: "input",
        block_id: "body",
        label: { type: "plain_text", text: "Body" },
        element: {
          type: "plain_text_input",
          action_id: "value",
          multiline: true,
          initial_value: draft.body,
        },
      },
    ],
  };
}
