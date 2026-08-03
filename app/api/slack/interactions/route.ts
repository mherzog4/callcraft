import { WebClient } from "@slack/web-api";
import { after } from "next/server";
import { z } from "zod";
import { getEnv } from "@/src/env";
import { verifySlackSignature } from "@/src/integrations/slack/signature";
import {
  editDraftModal,
  evidenceModal,
  sendConfirmationModal,
} from "@/src/integrations/slack/render";
import { decryptSecret } from "@/src/security/crypto";
import { emailDraftSchema, callSummarySchema } from "@/src/domain/schemas";
import {
  enqueueJob,
  getCallForSeller,
  getCredential,
  getDraftForSeller,
  getGongContext,
  getInstallation,
  getSegments,
  getSellerBySlack,
  getSendIntentForDraft,
  latestSummary,
  saveDraft,
} from "@/src/db/repositories";
import { queueConfirmedSend, queueRegeneration } from "@/src/jobs/worker";
import { logger } from "@/src/security/logger";
import { scheduleSlackOperation } from "@/src/integrations/slack/deferred";

const actorSchema = z.object({
  team: z.object({ id: z.string() }),
  user: z.object({ id: z.string() }),
});
const actionPayload = actorSchema
  .extend({
    type: z.literal("block_actions"),
    trigger_id: z.string(),
    actions: z
      .array(
        z.object({
          action_id: z.string(),
          value: z.string().optional(),
          action_ts: z.string().optional(),
        }),
      )
      .min(1),
  })
  .passthrough();
const viewPayload = actorSchema
  .extend({
    type: z.literal("view_submission"),
    view: z.object({
      callback_id: z.string(),
      private_metadata: z.string(),
      state: z.object({
        values: z.record(
          z.record(z.object({ value: z.string().nullable().optional() }).passthrough()),
        ),
      }),
    }),
  })
  .passthrough();

function draftValue(row: NonNullable<ReturnType<typeof getDraftForSeller>>) {
  return emailDraftSchema.parse({
    to: JSON.parse(row.toJson),
    cc: JSON.parse(row.ccJson),
    subject: row.subject,
    body: row.body,
  });
}
function openViewAfterAck(
  client: WebClient,
  triggerId: string,
  view: Parameters<WebClient["views"]["open"]>[0]["view"],
): void {
  scheduleSlackOperation(
    () => client.views.open({ trigger_id: triggerId, view }),
    after,
    (error) => {
      logger.error(
        { category: "slack_view_open", errorName: error instanceof Error ? error.name : "unknown" },
        "Deferred Slack modal open failed",
      );
    },
  );
}

function actor(teamId: string, userId: string) {
  const seller = getSellerBySlack(teamId, userId);
  if (!seller) throw new Error("Slack actor is not linked to a seller");
  const install = getInstallation(seller.id, "slack");
  if (!install || install.status !== "connected") throw new Error("Slack installation missing");
  const credential = getCredential(install.id);
  if (!credential?.accessTokenEncrypted) throw new Error("Slack bot token missing");
  return {
    seller,
    client: new WebClient(decryptSecret(credential.accessTokenEncrypted, getEnv().MASTER_KEY)),
  };
}

export async function POST(request: Request) {
  const env = getEnv();
  if (env.DEMO_MODE)
    return new Response("Real Slack interactions are disabled in demo mode", { status: 403 });
  if (!env.SLACK_SIGNING_SECRET)
    return new Response("Slack signing secret unavailable", { status: 503 });
  const body = await request.text();
  if (
    !verifySlackSignature({
      body,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
      signingSecret: env.SLACK_SIGNING_SECRET,
    })
  )
    return new Response("Invalid Slack signature", { status: 401 });
  const raw = JSON.parse(new URLSearchParams(body).get("payload") ?? "{}") as unknown;

  if ((raw as { type?: string }).type === "block_actions") {
    const payload = actionPayload.parse(raw);
    const current = actor(payload.team.id, payload.user.id);
    const action = payload.actions[0]!;
    const value = action.value ?? "";
    if (action.action_id === "regenerate_draft") {
      if (!getCallForSeller(value, current.seller.id))
        return new Response("Not found", { status: 404 });
      queueRegeneration(
        value,
        current.seller.id,
        action.action_ts ?? `${payload.trigger_id}:regen`,
      );
      return Response.json({ text: "Regeneration queued" });
    }
    if (action.action_id === "view_evidence") {
      const call = getCallForSeller(value, current.seller.id);
      const summaryRow = call ? latestSummary(call.id) : undefined;
      if (!call || !summaryRow) return new Response("Not found", { status: 404 });
      openViewAfterAck(
        current.client,
        payload.trigger_id,
        evidenceModal({
          callId: call.id,
          context: getGongContext(call.id),
          summary: callSummarySchema.parse(JSON.parse(summaryRow.summaryJson)),
          segments: getSegments(call.id),
        }) as unknown as Parameters<typeof current.client.views.open>[0]["view"],
      );
      return new Response(null, { status: 200 });
    }
    const draft = getDraftForSeller(value, current.seller.id);
    if (!draft) return new Response("Not found", { status: 404 });
    if (action.action_id === "edit_draft") {
      openViewAfterAck(
        current.client,
        payload.trigger_id,
        editDraftModal(draft.id, draftValue(draft)) as unknown as Parameters<
          typeof current.client.views.open
        >[0]["view"],
      );
      return new Response(null, { status: 200 });
    }
    if (action.action_id === "send_email") {
      const google = getInstallation(current.seller.id, "google");
      if (!google || google.status !== "connected" || google.mode !== "real")
        return Response.json({ text: "Connect Gmail before sending" }, { status: 409 });
      const prior = getSendIntentForDraft(draft.id);
      if (prior?.status === "submitted")
        return Response.json(
          { text: "This exact revision was already submitted" },
          { status: 409 },
        );
      if (prior?.status === "unknown" || prior?.status === "submitting")
        return Response.json(
          { text: "Reconcile this revision in Gmail before attempting another send" },
          { status: 409 },
        );
      const sender = google.externalAccountId;
      if (!sender) return Response.json({ text: "Reconnect Gmail" }, { status: 409 });
      openViewAfterAck(
        current.client,
        payload.trigger_id,
        sendConfirmationModal(draft.id, sender, draftValue(draft)) as unknown as Parameters<
          typeof current.client.views.open
        >[0]["view"],
      );
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  }

  const payload = viewPayload.parse(raw);
  const current = actor(payload.team.id, payload.user.id);
  if (payload.view.callback_id === "send_email_submit") {
    const metadata = z
      .object({ draftId: z.string(), sender: z.string().email() })
      .parse(JSON.parse(payload.view.private_metadata));
    const draft = getDraftForSeller(metadata.draftId, current.seller.id);
    const google = getInstallation(current.seller.id, "google");
    if (
      !draft ||
      !google ||
      google.status !== "connected" ||
      google.externalAccountId !== metadata.sender
    )
      return Response.json({ response_action: "errors", errors: {} }, { status: 409 });
    queueConfirmedSend({
      draftId: metadata.draftId,
      sellerId: current.seller.id,
      sender: metadata.sender,
    });
    return Response.json({ response_action: "clear" });
  }
  if (payload.view.callback_id === "edit_draft_submit") {
    const draft = getDraftForSeller(payload.view.private_metadata, current.seller.id);
    if (!draft) return new Response("Not found", { status: 404 });
    const call = getCallForSeller(draft.callId, current.seller.id);
    if (!call) return new Response("Not found", { status: 404 });
    const values = payload.view.state.values;
    const read = (block: string) => values[block]?.value?.value ?? "";
    const addresses = (block: string) =>
      read(block)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const edited = emailDraftSchema.safeParse({
      to: addresses("to"),
      cc: addresses("cc"),
      subject: read("subject"),
      body: read("body"),
    });
    if (!edited.success)
      return Response.json({
        response_action: "errors",
        errors: { to: "Enter valid recipients and content" },
      });
    const summary = latestSummary(call.id);
    if (!summary) throw new Error("Summary missing");
    const next = saveDraft(call.id, summary.id, edited.data, "edited");
    enqueueJob("deliver_slack", `deliver:${next.id}`, {
      callId: call.id,
      draftId: next.id,
      sellerId: call.sellerId,
    });
    return Response.json({ response_action: "clear" });
  }
  return new Response(null, { status: 200 });
}
