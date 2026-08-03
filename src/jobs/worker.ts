import { randomUUID } from "node:crypto";
import { callSummarySchema, emailDraftSchema, preferencesSchema } from "@/src/domain/schemas";
import { getEnv } from "@/src/env";
import { createGongAdapter } from "@/src/integrations/gong";
import { GongError } from "@/src/integrations/gong/contract";
import { createGenerator } from "@/src/integrations/openrouter";
import { GenerationError } from "@/src/integrations/openrouter/types";
import { SlackDestination, PreviewSlackDestination } from "@/src/integrations/slack/client";
import { GmailSender, PreviewEmailSender } from "@/src/integrations/email";
import { EmailSendError } from "@/src/integrations/email/types";
import { decryptSecret } from "@/src/security/crypto";
import { logger } from "@/src/security/logger";
import {
  claimJob,
  completeJob,
  createSendIntent,
  deadLetterJob,
  enqueueJob,
  failJob,
  getCall,
  getCredential,
  getDraft,
  getGongContext,
  getInstallation,
  getInstallationById,
  getLatestSlackDeliveryForCall,
  listGongInstallations,
  getParticipants,
  getSegments,
  getSeller,
  getSendIntent,
  getSendIntentForDraft,
  getSlackDelivery,
  getSummary,
  getSyncCursor,
  latestSummary,
  purgeTranscriptData,
  reschedulePendingTranscript,
  reviveDeadJob,
  saveCallDetails,
  saveDraft,
  saveSlackDelivery,
  saveSummary,
  setCallState,
  updateInstallation,
  updateSendIntent,
  updateSyncCursor,
  upsertCall,
} from "@/src/db/repositories";

class PendingTranscriptError extends Error {}

function readEncryptedConfig(installationId: string): Record<string, string> {
  const credential = getCredential(installationId);
  if (!credential?.secretEncrypted) return {};
  const value = JSON.parse(
    decryptSecret(credential.secretEncrypted, getEnv().MASTER_KEY),
  ) as unknown;
  if (!value || typeof value !== "object") throw new Error("Provider credential is malformed");
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function gongForInstallation(installation: NonNullable<ReturnType<typeof getInstallationById>>) {
  const config = readEncryptedConfig(installation.id);
  const metadata = JSON.parse(installation.metadataJson) as {
    failMode?: "rate_limit" | "provider";
  };
  return createGongAdapter(installation.mode, {
    key: installation.id,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    ...(config.accessKey ? { accessKey: config.accessKey } : {}),
    ...(config.accessSecret ? { accessSecret: config.accessSecret } : {}),
    ...(metadata.failMode ? { failMode: metadata.failMode } : {}),
  });
}

function generatorForSeller(sellerId: string) {
  const installation = getInstallation(sellerId, "openrouter");
  if (!installation) throw new Error("OpenRouter installation missing");
  const config = readEncryptedConfig(installation.id);
  const metadata = JSON.parse(installation.metadataJson) as { model?: string };
  return createGenerator(installation.mode, {
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(metadata.model ? { modelId: metadata.model } : {}),
  });
}
interface Payload {
  sellerId?: string;
  installationId?: string;
  callId?: string;
  draftId?: string;
  intentId?: string;
  deliveryStatus?: string;
}

export function recordEmailSendFailure(intentId: string, error: unknown): EmailSendError {
  const intent = getSendIntent(intentId);
  if (!intent) throw new Error("Send intent missing");
  const googleInstallation = getInstallation(intent.sellerId, "google");
  if (!googleInstallation) throw new Error("Google installation missing");
  const intentDraft = getDraft(intent.draftRevisionId);
  const sendError =
    error instanceof EmailSendError
      ? error
      : new EmailSendError("Gmail outcome is unknown; reconcile before retrying", "unknown", false);
  if (sendError.category === "auth") {
    updateSendIntent(intent.id, { status: "failed" });
    updateInstallation(googleInstallation.id, {
      status: "error",
      metadataJson: JSON.stringify({
        ...JSON.parse(googleInstallation.metadataJson),
        reconnectRequired: true,
        lastError: "gmail_auth",
      }),
    });
    if (intentDraft)
      enqueueJob("deliver_slack", `deliver-status:${intent.id}:auth`, {
        callId: intentDraft.callId,
        draftId: intentDraft.id,
        sellerId: intent.sellerId,
        deliveryStatus:
          "Gmail authorization expired — reconnect Gmail in Settings. Email was not sent.",
      });
  } else if (sendError.category === "rejected") {
    updateSendIntent(intent.id, { status: "failed" });
    if (intentDraft)
      enqueueJob("deliver_slack", `deliver-status:${intent.id}:rejected`, {
        callId: intentDraft.callId,
        draftId: intentDraft.id,
        sellerId: intent.sellerId,
        deliveryStatus: "Gmail rejected this message — review it and create a new revision.",
      });
  } else {
    updateSendIntent(intent.id, { status: "unknown" });
    if (intentDraft)
      enqueueJob("deliver_slack", `deliver-status:${intent.id}:unknown`, {
        callId: intentDraft.callId,
        draftId: intentDraft.id,
        sellerId: intent.sellerId,
        deliveryStatus: "Send outcome unknown — reconcile in Gmail",
      });
  }
  return sendError;
}

async function processJob(type: string, payload: Payload): Promise<void> {
  if (type === "discover_calls") {
    if (!payload.sellerId || !payload.installationId) throw new Error("Invalid discovery payload");
    const installation = getInstallationById(payload.installationId);
    if (
      !installation ||
      installation.sellerId !== payload.sellerId ||
      installation.provider !== "gong"
    )
      throw new Error("Gong installation missing or tenant mismatch");
    const adapter = gongForInstallation(installation);
    const saved = getSyncCursor(installation.id, "calls");
    const to = new Date();
    const from = saved?.windowEnd
      ? new Date(saved.windowEnd.getTime() - 5 * 60_000)
      : new Date(to.getTime() - 7 * 86400_000);
    let cursor: string | undefined;
    do {
      const page = await adapter.listCalls({ from, to, ...(cursor ? { cursor } : {}) });
      for (const discovered of page.calls.filter(
        (call) =>
          !installation.externalAccountId || call.primaryUserId === installation.externalAccountId,
      )) {
        const row = upsertCall(installation.id, payload.sellerId, discovered);
        const fetchJob = enqueueJob(
          "fetch_call",
          `fetch:${row.id}:initial`,
          {
            sellerId: payload.sellerId,
            installationId: installation.id,
            callId: row.id,
          },
          new Date(),
          5,
        );
        // A later discovery pass may safely supersede a terminal fetch failure.
        reviveDeadJob(fetchJob.id);
      }
      cursor = page.cursor ?? undefined;
    } while (cursor);
    updateSyncCursor(installation.id, "calls", null, to);
    return;
  }
  if (type === "fetch_call") {
    if (!payload.callId || !payload.installationId || !payload.sellerId)
      throw new Error("Invalid fetch payload");
    const call = getCall(payload.callId);
    const installation = getInstallationById(payload.installationId);
    if (
      !call ||
      !installation ||
      call.sellerId !== payload.sellerId ||
      installation.sellerId !== payload.sellerId ||
      call.installationId !== installation.id
    )
      throw new Error("Call or installation missing or tenant mismatch");
    const detail = await gongForInstallation(installation).getCall({
      externalId: call.externalCallId,
      from: new Date(call.startedAt.getTime() - 60_000),
      to: new Date(call.startedAt.getTime() + (call.durationSeconds + 3600) * 1000),
    });
    saveCallDetails(call.id, detail);
    if (!detail.segments.length) {
      setCallState(call.id, "awaiting_transcript");
      throw new PendingTranscriptError("Transcript is not available yet");
    }
    enqueueJob("extract_summary", `extract:${call.id}:1`, {
      callId: call.id,
      sellerId: call.sellerId,
      installationId: call.installationId,
    });
    return;
  }
  if (type === "extract_summary") {
    if (!payload.callId) throw new Error("Invalid extraction payload");
    const call = getCall(payload.callId);
    if (!call || (payload.sellerId && call.sellerId !== payload.sellerId))
      throw new Error("Call missing or tenant mismatch");
    setCallState(call.id, "extracting");
    const seller = getSeller(call.sellerId);
    const segments = getSegments(call.id);
    const result = await generatorForSeller(call.sellerId).extract({
      segments,
      participants: getParticipants(call.id).map((p) => ({
        externalId: p.externalId,
        speakerId: p.speakerId,
        name: p.name,
        email: p.email,
        title: p.title,
        affiliation: p.affiliation as "Internal" | "External" | "Unknown",
      })),
      context: getGongContext(call.id),
    });
    const saved = saveSummary(call.id, result.value, result.modelId, result.usage);
    setCallState(call.id, "drafting");
    enqueueJob("compose_draft", `draft:${call.id}:${saved.revision}`, {
      callId: call.id,
      sellerId: seller?.id,
      installationId: call.installationId,
    });
    return;
  }
  if (type === "compose_draft") {
    if (!payload.callId) throw new Error("Invalid draft payload");
    const call = getCall(payload.callId);
    const summaryRow = latestSummary(payload.callId);
    if (!call || !summaryRow || (payload.sellerId && call.sellerId !== payload.sellerId))
      throw new Error("Call summary missing or tenant mismatch");
    const seller = getSeller(call.sellerId);
    if (!seller) throw new Error("Seller missing");
    const parties = getParticipants(call.id).map((p) => ({
      externalId: p.externalId,
      speakerId: p.speakerId,
      name: p.name,
      email: p.email,
      title: p.title,
      affiliation: p.affiliation as "Internal" | "External" | "Unknown",
    }));
    const result = await generatorForSeller(call.sellerId).compose({
      summary: callSummarySchema.parse(JSON.parse(summaryRow.summaryJson)),
      participants: parties,
      preferences: preferencesSchema.parse(JSON.parse(seller.preferencesJson)),
      callTitle: call.title,
    });
    const draft = saveDraft(
      call.id,
      summaryRow.id,
      result.value,
      summaryRow.revision > 1 ? "regenerated" : "generated",
    );
    setCallState(call.id, "delivering");
    enqueueJob("deliver_slack", `deliver:${draft.id}`, {
      callId: call.id,
      draftId: draft.id,
      sellerId: seller.id,
    });
    return;
  }
  if (type === "deliver_slack") {
    if (!payload.callId || !payload.draftId || !payload.sellerId)
      throw new Error("Invalid Slack delivery payload");
    const call = getCall(payload.callId);
    const row = getDraft(payload.draftId);
    const seller = getSeller(payload.sellerId);
    const summaryRow = row ? getSummary(row.summaryId) : undefined;
    if (
      !call ||
      !row ||
      !seller ||
      !summaryRow ||
      call.sellerId !== seller.id ||
      row.callId !== call.id
    )
      throw new Error("Slack delivery data missing or tenant mismatch");
    const installation = getInstallation(seller.id, "slack");
    if (!installation || installation.status !== "connected")
      throw new Error("Slack installation missing or disconnected");
    if (getEnv().DEMO_MODE && installation.mode !== "demo")
      throw new Error("Real Slack access is disabled in demo mode");
    const existing = getSlackDelivery(row.id) ?? getLatestSlackDeliveryForCall(call.id);
    let destination;
    if (installation.mode === "demo") destination = new PreviewSlackDestination();
    else {
      const credential = getCredential(installation.id);
      if (!credential?.accessTokenEncrypted) throw new Error("Slack bot token missing");
      destination = new SlackDestination(
        decryptSecret(credential.accessTokenEncrypted, getEnv().MASTER_KEY),
      );
    }
    const result = await destination.deliver({
      callId: call.id,
      draftId: row.id,
      sellerSlackUserId: seller.slackUserId ?? installation.externalAccountId ?? "",
      title: call.title,
      gongUrl: call.gongUrl,
      context: getGongContext(call.id),
      summary: callSummarySchema.parse(JSON.parse(summaryRow.summaryJson)),
      draft: emailDraftSchema.parse({
        to: JSON.parse(row.toJson),
        cc: JSON.parse(row.ccJson),
        subject: row.subject,
        body: row.body,
      }),
      ...(payload.deliveryStatus ? { status: payload.deliveryStatus } : {}),
      allowSend: !["submitted", "submitting", "unknown", "failed"].includes(
        getSendIntentForDraft(row.id)?.status ?? "",
      ),
      ...(existing?.channelId && existing.messageTs
        ? { previous: { channelId: existing.channelId, messageTs: existing.messageTs } }
        : {}),
    });
    saveSlackDelivery(row.id, { status: "delivered", ...result });
    setCallState(call.id, "delivered");
    return;
  }
  if (type === "send_email") {
    if (!payload.intentId) throw new Error("Invalid email payload");
    const intent = getSendIntent(payload.intentId);
    if (!intent || intent.status === "submitted" || intent.status === "unknown") return;
    if (intent.status === "submitting") {
      updateSendIntent(intent.id, { status: "unknown" });
      const uncertainDraft = getDraft(intent.draftRevisionId);
      if (uncertainDraft)
        enqueueJob("deliver_slack", `deliver-status:${intent.id}:lease-unknown`, {
          callId: uncertainDraft.callId,
          draftId: uncertainDraft.id,
          sellerId: intent.sellerId,
          deliveryStatus: "Send outcome unknown after worker recovery — reconcile in Gmail",
        });
      return;
    }
    if (intent.status !== "confirmed") throw new Error("Send intent is not confirmed");
    const googleInstallation = getInstallation(intent.sellerId, "google");
    if (!googleInstallation || googleInstallation.status !== "connected")
      throw new EmailSendError("Connected Gmail account required", "auth", false);
    if (getEnv().DEMO_MODE && googleInstallation.mode !== "demo")
      throw new EmailSendError("Real Gmail access is disabled in demo mode", "auth", false);
    const draft = emailDraftSchema.parse({
      to: JSON.parse(intent.toJson),
      cc: JSON.parse(intent.ccJson),
      subject: intent.subjectSnapshot,
      body: intent.bodySnapshot,
    });
    updateSendIntent(intent.id, { status: "submitting" });
    let sender;
    if (googleInstallation.mode === "demo") sender = new PreviewEmailSender();
    else {
      const env = getEnv();
      const credential = getCredential(googleInstallation.id);
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !credential)
        throw new Error("Google credentials missing");
      sender = new GmailSender({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${env.APP_URL}/api/google/oauth/callback`,
        ...(credential.accessTokenEncrypted
          ? { accessToken: decryptSecret(credential.accessTokenEncrypted, env.MASTER_KEY) }
          : {}),
        ...(credential.refreshTokenEncrypted
          ? { refreshToken: decryptSecret(credential.refreshTokenEncrypted, env.MASTER_KEY) }
          : {}),
      });
    }
    const intentDraft = getDraft(intent.draftRevisionId);
    try {
      const result = await sender.send({ intentId: intent.id, from: intent.sender, draft });
      updateSendIntent(intent.id, {
        status: "submitted",
        gmailMessageId: result.messageId,
        gmailThreadId: result.threadId,
        submittedAt: result.acceptedAt,
      });
      if (intentDraft)
        enqueueJob("deliver_slack", `deliver-status:${intent.id}:submitted`, {
          callId: intentDraft.callId,
          draftId: intentDraft.id,
          sellerId: intent.sellerId,
          deliveryStatus: "Submitted via Gmail",
        });
    } catch (error) {
      throw recordEmailSendFailure(intent.id, error);
    }
    return;
  }
  if (type === "cleanup") {
    const seller = payload.sellerId ? getSeller(payload.sellerId) : undefined;
    const preferences = seller ? preferencesSchema.parse(JSON.parse(seller.preferencesJson)) : null;
    const days = preferences?.retentionDays ?? getEnv().TRANSCRIPT_RETENTION_DAYS;
    const afterDelivery = preferences?.retentionMode === "after_delivery";
    purgeTranscriptData(
      afterDelivery ? new Date() : new Date(Date.now() - days * 86400_000),
      seller?.id,
      afterDelivery,
    );
    return;
  }
  throw new Error(`Unknown job type: ${type}`);
}

export async function runWorkerOnce(workerId = `worker-${randomUUID()}`): Promise<boolean> {
  const job = claimJob(workerId);
  if (!job) return false;
  try {
    await processJob(job.type, JSON.parse(job.payloadJson) as Payload);
    completeJob(job.id);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    const category =
      error instanceof PendingTranscriptError
        ? "transcript_pending"
        : error instanceof GongError
          ? error.category
          : error instanceof GenerationError || error instanceof EmailSendError
            ? error.category
            : "worker";
    const retry =
      error instanceof PendingTranscriptError
        ? Math.min(6 * 60 * 60_000, Math.max(60_000, 30_000 * 2 ** Math.min(job.attempts, 10)))
        : error instanceof GongError
          ? error.retryAfterMs
          : undefined;
    const payload = JSON.parse(job.payloadJson) as Payload;
    const nonRetryable =
      (error instanceof EmailSendError && !error.retryable) ||
      (error instanceof GenerationError && !error.retryable) ||
      (error instanceof GongError && !error.retryAfterMs && error.category === "auth");
    let jobStatus: "retry_wait" | "dead_letter";
    if (error instanceof PendingTranscriptError) {
      reschedulePendingTranscript(job.id, message, retry ?? 60_000);
      jobStatus = "retry_wait";
    } else if (nonRetryable) {
      deadLetterJob(job.id, category, message);
      jobStatus = "dead_letter";
    } else {
      jobStatus = failJob(job.id, category, message, retry);
    }
    if (payload.callId) {
      try {
        setCallState(
          payload.callId,
          error instanceof PendingTranscriptError
            ? "awaiting_transcript"
            : jobStatus === "dead_letter"
              ? "dead_letter"
              : "retry_wait",
          { category, message },
        );
      } catch {
        // A terminal or concurrent state may already be newer than this failed job.
      }
    }
    logger.warn({ jobId: job.id, type: job.type, category }, "Job failed safely");
    return true;
  }
}

export async function runWorkerUntilIdle(maxJobs = 100): Promise<number> {
  let count = 0;
  while (count < maxJobs && (await runWorkerOnce())) count += 1;
  return count;
}

export function queueRegeneration(
  callId: string,
  sellerId: string,
  replayKey: string = randomUUID(),
): void {
  const call = getCall(callId);
  if (!call || call.sellerId !== sellerId) throw new Error("Call missing or tenant mismatch");
  enqueueJob("extract_summary", `extract:${callId}:manual:${replayKey}`, {
    callId,
    sellerId: call.sellerId,
    installationId: call.installationId,
  });
}
export function queueConfirmedSend(input: {
  draftId: string;
  sellerId: string;
  sender: string;
}): string {
  const row = getDraft(input.draftId);
  const call = row ? getCall(row.callId) : undefined;
  if (!row || !call || call.sellerId !== input.sellerId)
    throw new Error("Draft missing or tenant mismatch");
  const google = getInstallation(input.sellerId, "google");
  if (!google || google.status !== "connected") throw new Error("Connected Gmail account required");
  const draft = emailDraftSchema.parse({
    to: JSON.parse(row.toJson),
    cc: JSON.parse(row.ccJson),
    subject: row.subject,
    body: row.body,
  });
  const intent = createSendIntent({
    draftRevisionId: row.id,
    sellerId: input.sellerId,
    sender: input.sender,
    draft,
  });
  enqueueJob("send_email", `send:${intent.id}`, {
    intentId: intent.id,
    sellerId: input.sellerId,
  });
  return intent.id;
}

export function scheduleRecurringJobs(at = new Date()): number {
  let count = 0;
  const fiveMinuteBucket = Math.floor(at.getTime() / (5 * 60_000));
  const dayBucket = at.toISOString().slice(0, 10);
  for (const installation of listGongInstallations().filter(
    (item) => item.status === "connected",
  )) {
    enqueueJob("discover_calls", `discover:${installation.id}:${fiveMinuteBucket}`, {
      sellerId: installation.sellerId,
      installationId: installation.id,
    });
    enqueueJob("cleanup", `cleanup:${installation.sellerId}:${dayBucket}`, {
      sellerId: installation.sellerId,
    });
    count += 2;
  }
  return count;
}
