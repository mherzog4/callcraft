import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type {
  CallSummary,
  EmailDraft,
  GongContext,
  NormalizedCall,
  SellerPreferences,
  TranscriptSegment,
  CallState,
  JobType,
} from "@/src/domain/schemas";
import { callStateSchema, jobTypeSchema, preferencesSchema } from "@/src/domain/schemas";
import { getDatabase } from "./client";
import {
  calls,
  draftRevisions,
  emailSendIntents,
  evidences,
  gongAnalyses,
  installations,
  jobs,
  oauthCredentials,
  participants,
  sellers,
  slackDeliveries,
  summaries,
  syncCursors,
  transcriptSegments,
} from "./schema";

const now = () => new Date();
export type Db = ReturnType<typeof getDatabase>["db"];

export function upsertSeller(input: {
  id?: string;
  email: string;
  displayName: string;
  preferences?: SellerPreferences;
}) {
  const db = getDatabase().db;
  const existing = db.select().from(sellers).where(eq(sellers.email, input.email)).get();
  if (existing) return existing;
  const row = {
    id: input.id ?? randomUUID(),
    email: input.email,
    displayName: input.displayName,
    preferencesJson: JSON.stringify(input.preferences ?? preferencesSchema.parse({})),
  };
  db.insert(sellers).values(row).run();
  return db.select().from(sellers).where(eq(sellers.id, row.id)).get()!;
}

export function upsertInstallation(input: {
  sellerId: string;
  provider: "gong" | "slack" | "google" | "openrouter";
  mode: "demo" | "real";
  status?: "connected" | "disconnected" | "error";
  externalAccountId?: string;
  metadata?: unknown;
}) {
  const db = getDatabase().db;
  const existing = db
    .select()
    .from(installations)
    .where(
      and(eq(installations.sellerId, input.sellerId), eq(installations.provider, input.provider)),
    )
    .get();
  const values = {
    mode: input.mode,
    status: input.status ?? ("connected" as const),
    externalAccountId: input.externalAccountId ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    updatedAt: now(),
  };
  if (existing) {
    db.update(installations).set(values).where(eq(installations.id, existing.id)).run();
    return db.select().from(installations).where(eq(installations.id, existing.id)).get()!;
  }
  const id = randomUUID();
  db.insert(installations)
    .values({ id, sellerId: input.sellerId, provider: input.provider, ...values })
    .run();
  return db.select().from(installations).where(eq(installations.id, id)).get()!;
}

export function saveCredential(input: {
  installationId: string;
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
  secretEncrypted?: string;
  expiresAt?: Date;
  scopes?: string;
}) {
  const db = getDatabase().db;
  const existing = db
    .select()
    .from(oauthCredentials)
    .where(eq(oauthCredentials.installationId, input.installationId))
    .get();
  const values = {
    accessTokenEncrypted: input.accessTokenEncrypted ?? existing?.accessTokenEncrypted ?? null,
    refreshTokenEncrypted: input.refreshTokenEncrypted ?? existing?.refreshTokenEncrypted ?? null,
    secretEncrypted: input.secretEncrypted ?? existing?.secretEncrypted ?? null,
    expiresAt: input.expiresAt ?? existing?.expiresAt ?? null,
    scopes: input.scopes ?? existing?.scopes ?? "",
    updatedAt: now(),
  };
  if (existing)
    db.update(oauthCredentials).set(values).where(eq(oauthCredentials.id, existing.id)).run();
  else
    db.insert(oauthCredentials)
      .values({ id: randomUUID(), installationId: input.installationId, ...values })
      .run();
}

export function getSeller(id: string) {
  return getDatabase().db.select().from(sellers).where(eq(sellers.id, id)).get();
}
export function getSellerBySlack(teamId: string, userId: string) {
  return getDatabase()
    .db.select()
    .from(sellers)
    .where(and(eq(sellers.slackTeamId, teamId), eq(sellers.slackUserId, userId)))
    .get();
}
export function updateSeller(
  id: string,
  values: {
    email?: string;
    displayName?: string;
    gongUserId?: string;
    slackTeamId?: string;
    slackUserId?: string;
    preferencesJson?: string;
  },
) {
  getDatabase()
    .db.update(sellers)
    .set({ ...values, updatedAt: now() })
    .where(eq(sellers.id, id))
    .run();
  return getSeller(id);
}
export function listInstallations(sellerId: string) {
  return getDatabase()
    .db.select()
    .from(installations)
    .where(eq(installations.sellerId, sellerId))
    .all();
}
export function getInstallation(
  sellerId: string,
  provider: "gong" | "slack" | "google" | "openrouter",
) {
  return getDatabase()
    .db.select()
    .from(installations)
    .where(and(eq(installations.sellerId, sellerId), eq(installations.provider, provider)))
    .get();
}
export function getCredential(installationId: string) {
  return getDatabase()
    .db.select()
    .from(oauthCredentials)
    .where(eq(oauthCredentials.installationId, installationId))
    .get();
}
export function getInstallationById(id: string) {
  return getDatabase().db.select().from(installations).where(eq(installations.id, id)).get();
}
export function updateInstallation(
  id: string,
  values: {
    status?: "connected" | "disconnected" | "error";
    externalAccountId?: string | null;
    metadataJson?: string;
  },
) {
  getDatabase()
    .db.update(installations)
    .set({ ...values, updatedAt: now() })
    .where(eq(installations.id, id))
    .run();
  return getInstallationById(id);
}

export function upsertCall(
  installationId: string,
  sellerId: string,
  call: Pick<
    NormalizedCall,
    "externalId" | "url" | "title" | "startedAt" | "durationSeconds" | "providerRequestId"
  >,
) {
  const db = getDatabase().db;
  const id = randomUUID();
  db.insert(calls)
    .values({
      id,
      installationId,
      sellerId,
      externalCallId: call.externalId,
      title: call.title,
      gongUrl: call.url,
      startedAt: new Date(call.startedAt),
      durationSeconds: call.durationSeconds,
      state: "discovered",
      providerRequestId: call.providerRequestId,
    })
    .onConflictDoNothing({ target: [calls.installationId, calls.externalCallId] })
    .run();
  return db
    .select()
    .from(calls)
    .where(and(eq(calls.installationId, installationId), eq(calls.externalCallId, call.externalId)))
    .get()!;
}

export function saveCallDetails(callId: string, call: NormalizedCall): void {
  const { db } = getDatabase();
  db.transaction((tx) => {
    tx.delete(participants).where(eq(participants.callId, callId)).run();
    if (call.participants.length)
      tx.insert(participants)
        .values(
          call.participants.map((party) => ({
            id: randomUUID(),
            callId,
            externalId: party.externalId,
            speakerId: party.speakerId,
            name: party.name,
            email: party.email,
            title: party.title,
            affiliation: party.affiliation,
          })),
        )
        .run();
    tx.delete(transcriptSegments).where(eq(transcriptSegments.callId, callId)).run();
    if (call.segments.length)
      tx.insert(transcriptSegments)
        .values(
          call.segments.map((segment) => ({
            id: randomUUID(),
            callId,
            externalSegmentId: segment.id,
            speakerId: segment.speakerId,
            speakerName: segment.speakerName,
            startMs: segment.startMs,
            endMs: segment.endMs,
            text: segment.text,
            topic: segment.topic,
          })),
        )
        .run();
    tx.delete(gongAnalyses).where(eq(gongAnalyses.callId, callId)).run();
    if (call.context)
      tx.insert(gongAnalyses)
        .values({
          id: randomUUID(),
          callId,
          brief: call.context.brief,
          outlineJson: JSON.stringify(call.context.outline),
          highlightsJson: JSON.stringify(call.context.highlights),
          outcome: call.context.outcome,
          keyPointsJson: JSON.stringify(call.context.keyPoints),
        })
        .run();
    tx.update(calls)
      .set({
        state: call.segments.length ? "ready" : "awaiting_transcript",
        transcriptAvailableAt: call.segments.length ? now() : null,
        providerRequestId: call.providerRequestId,
        updatedAt: now(),
      })
      .where(eq(calls.id, callId))
      .run();
  });
}

const allowedCallTransitions: Record<CallState, readonly CallState[]> = {
  discovered: ["awaiting_transcript", "ready", "retry_wait", "dead_letter"],
  awaiting_transcript: ["awaiting_transcript", "ready", "retry_wait", "dead_letter"],
  ready: ["extracting", "retry_wait", "dead_letter"],
  extracting: ["drafting", "retry_wait", "dead_letter"],
  drafting: ["delivering", "retry_wait", "dead_letter"],
  delivering: ["delivered", "retry_wait", "dead_letter"],
  delivered: ["extracting", "delivering", "retry_wait", "dead_letter"],
  retry_wait: [
    "awaiting_transcript",
    "ready",
    "extracting",
    "drafting",
    "delivering",
    "delivered",
    "dead_letter",
  ],
  dead_letter: ["awaiting_transcript", "ready", "extracting"],
};
export function setCallState(
  callId: string,
  state: CallState,
  error?: { category: string; message: string },
) {
  callStateSchema.parse(state);
  const db = getDatabase().db;
  const current = db.select({ state: calls.state }).from(calls).where(eq(calls.id, callId)).get();
  if (!current) throw new Error("Call missing");
  const currentState = callStateSchema.parse(current.state);
  if (currentState !== state && !allowedCallTransitions[currentState].includes(state)) {
    throw new Error(`Invalid call transition ${currentState} -> ${state}`);
  }
  db.update(calls)
    .set({
      state,
      lastErrorCategory: error?.category ?? null,
      lastErrorMessage: error?.message.slice(0, 500) ?? null,
      updatedAt: now(),
    })
    .where(eq(calls.id, callId))
    .run();
}

export function listCalls(sellerId: string, limit = 50) {
  return getDatabase()
    .db.select()
    .from(calls)
    .where(eq(calls.sellerId, sellerId))
    .orderBy(desc(calls.startedAt))
    .limit(limit)
    .all();
}
export function getCall(callId: string) {
  return getDatabase().db.select().from(calls).where(eq(calls.id, callId)).get();
}
export function getCallForSeller(callId: string, sellerId: string) {
  return getDatabase()
    .db.select()
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.sellerId, sellerId)))
    .get();
}
export function getCallByExternal(installationId: string, externalId: string) {
  return getDatabase()
    .db.select()
    .from(calls)
    .where(and(eq(calls.installationId, installationId), eq(calls.externalCallId, externalId)))
    .get();
}
export function getParticipants(callId: string) {
  return getDatabase().db.select().from(participants).where(eq(participants.callId, callId)).all();
}
export function getSegments(callId: string): TranscriptSegment[] {
  return getDatabase()
    .db.select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.callId, callId))
    .orderBy(asc(transcriptSegments.startMs))
    .all()
    .map((row) => ({
      id: row.externalSegmentId,
      speakerId: row.speakerId,
      speakerName: row.speakerName,
      startMs: row.startMs,
      endMs: row.endMs,
      text: row.text,
      topic: row.topic,
    }));
}
export function getGongContext(callId: string): GongContext | null {
  const row = getDatabase()
    .db.select()
    .from(gongAnalyses)
    .where(eq(gongAnalyses.callId, callId))
    .get();
  return row
    ? {
        brief: row.brief,
        outline: JSON.parse(row.outlineJson) as string[],
        highlights: JSON.parse(row.highlightsJson) as string[],
        outcome: row.outcome,
        keyPoints: JSON.parse(row.keyPointsJson) as string[],
      }
    : null;
}

export function saveSummary(
  callId: string,
  summary: CallSummary,
  modelId: string,
  usage: unknown = {},
) {
  const { db, sqlite } = getDatabase();
  const id = randomUUID();
  sqlite
    .transaction(() => {
      const revision =
        (db
          .select({ value: sql<number>`coalesce(max(${summaries.revision}), 0)` })
          .from(summaries)
          .where(eq(summaries.callId, callId))
          .get()?.value ?? 0) + 1;
      db.insert(summaries)
        .values({
          id,
          callId,
          revision,
          summaryJson: JSON.stringify(summary),
          modelId,
          usageJson: JSON.stringify(usage),
        })
        .run();
      db.insert(evidences)
        .values(
          summary.evidence.map((item) => ({
            id: randomUUID(),
            summaryId: id,
            claim: item.claim,
            segmentIdsJson: JSON.stringify(item.segmentIds),
          })),
        )
        .run();
    })
    .immediate();
  return db.select().from(summaries).where(eq(summaries.id, id)).get()!;
}

export function latestSummary(callId: string) {
  return getDatabase()
    .db.select()
    .from(summaries)
    .where(eq(summaries.callId, callId))
    .orderBy(desc(summaries.revision))
    .get();
}
export function getSummary(id: string) {
  return getDatabase().db.select().from(summaries).where(eq(summaries.id, id)).get();
}
export function saveDraft(
  callId: string,
  summaryId: string,
  draft: EmailDraft,
  source: "generated" | "edited" | "regenerated" = "generated",
) {
  const { db, sqlite } = getDatabase();
  const id = randomUUID();
  sqlite
    .transaction(() => {
      const revision =
        (db
          .select({ value: sql<number>`coalesce(max(${draftRevisions.revision}), 0)` })
          .from(draftRevisions)
          .where(eq(draftRevisions.callId, callId))
          .get()?.value ?? 0) + 1;
      db.insert(draftRevisions)
        .values({
          id,
          callId,
          summaryId,
          revision,
          toJson: JSON.stringify(draft.to),
          ccJson: JSON.stringify(draft.cc),
          subject: draft.subject,
          body: draft.body,
          source,
        })
        .run();
    })
    .immediate();
  return db.select().from(draftRevisions).where(eq(draftRevisions.id, id)).get()!;
}
export function latestDraft(callId: string) {
  return getDatabase()
    .db.select()
    .from(draftRevisions)
    .where(eq(draftRevisions.callId, callId))
    .orderBy(desc(draftRevisions.revision))
    .get();
}
export function getDraft(id: string) {
  return getDatabase().db.select().from(draftRevisions).where(eq(draftRevisions.id, id)).get();
}
export function getDraftForSeller(id: string, sellerId: string) {
  return getDatabase()
    .db.select({ draft: draftRevisions })
    .from(draftRevisions)
    .innerJoin(calls, eq(draftRevisions.callId, calls.id))
    .where(and(eq(draftRevisions.id, id), eq(calls.sellerId, sellerId)))
    .get()?.draft;
}
export function listDrafts(sellerId: string) {
  return getDatabase()
    .db.select({ draft: draftRevisions, call: calls })
    .from(draftRevisions)
    .innerJoin(calls, eq(draftRevisions.callId, calls.id))
    .where(eq(calls.sellerId, sellerId))
    .orderBy(desc(draftRevisions.createdAt))
    .limit(50)
    .all();
}

export function saveSlackDelivery(
  draftRevisionId: string,
  input: { status: "pending" | "delivered" | "failed"; channelId?: string; messageTs?: string },
) {
  const db = getDatabase().db;
  const existing = db
    .select()
    .from(slackDeliveries)
    .where(eq(slackDeliveries.draftRevisionId, draftRevisionId))
    .get();
  const values = {
    status: input.status,
    channelId: input.channelId ?? null,
    messageTs: input.messageTs ?? null,
    updatedAt: now(),
  };
  if (existing)
    db.update(slackDeliveries).set(values).where(eq(slackDeliveries.id, existing.id)).run();
  else
    db.insert(slackDeliveries)
      .values({ id: randomUUID(), draftRevisionId, ...values })
      .run();
}
export function getSlackDelivery(draftRevisionId: string) {
  return getDatabase()
    .db.select()
    .from(slackDeliveries)
    .where(eq(slackDeliveries.draftRevisionId, draftRevisionId))
    .get();
}
export function getLatestSlackDeliveryForCall(callId: string) {
  return getDatabase()
    .db.select({ delivery: slackDeliveries })
    .from(slackDeliveries)
    .innerJoin(draftRevisions, eq(slackDeliveries.draftRevisionId, draftRevisions.id))
    .where(eq(draftRevisions.callId, callId))
    .orderBy(desc(slackDeliveries.updatedAt))
    .get()?.delivery;
}

export function createSendIntent(input: {
  draftRevisionId: string;
  sellerId: string;
  sender: string;
  draft: EmailDraft;
}) {
  const db = getDatabase().db;
  const id = randomUUID();
  db.insert(emailSendIntents)
    .values({
      id,
      draftRevisionId: input.draftRevisionId,
      sellerId: input.sellerId,
      status: "confirmed",
      sender: input.sender,
      toJson: JSON.stringify(input.draft.to),
      ccJson: JSON.stringify(input.draft.cc),
      subjectSnapshot: input.draft.subject,
      bodySnapshot: input.draft.body,
    })
    .onConflictDoNothing({ target: emailSendIntents.draftRevisionId })
    .run();
  return db
    .select()
    .from(emailSendIntents)
    .where(eq(emailSendIntents.draftRevisionId, input.draftRevisionId))
    .get()!;
}
export function getSendIntent(id: string) {
  return getDatabase().db.select().from(emailSendIntents).where(eq(emailSendIntents.id, id)).get();
}
export function getSendIntentForDraft(draftRevisionId: string) {
  return getDatabase()
    .db.select()
    .from(emailSendIntents)
    .where(eq(emailSendIntents.draftRevisionId, draftRevisionId))
    .get();
}
export function updateSendIntent(
  id: string,
  values: Partial<typeof emailSendIntents.$inferInsert>,
) {
  getDatabase()
    .db.update(emailSendIntents)
    .set({ ...values, updatedAt: now() })
    .where(eq(emailSendIntents.id, id))
    .run();
}

export function enqueueJob(
  type: JobType,
  idempotencyKey: string,
  payload: unknown,
  runAfter = now(),
  maxAttempts = 5,
) {
  jobTypeSchema.parse(type);
  const db = getDatabase().db;
  const id = randomUUID();
  db.insert(jobs)
    .values({
      id,
      type,
      idempotencyKey,
      payloadJson: JSON.stringify(payload),
      status: "pending",
      runAfter,
      maxAttempts,
    })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .run();
  return db.select().from(jobs).where(eq(jobs.idempotencyKey, idempotencyKey)).get()!;
}
export function recoverExpiredJobs(leaseMs = 5 * 60_000): number {
  return getDatabase()
    .db.update(jobs)
    .set({
      status: "retry_wait",
      lockedAt: null,
      lockedBy: null,
      runAfter: now(),
      lastErrorCategory: "lease_expired",
      lastErrorMessage: "Worker lease expired; job safely reclaimed",
      updatedAt: now(),
    })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - leaseMs))))
    .run().changes;
}
export function claimJob(workerId: string, leaseMs = 5 * 60_000) {
  const { sqlite, db } = getDatabase();
  return sqlite
    .transaction(() => {
      db.update(jobs)
        .set({
          status: "retry_wait",
          lockedAt: null,
          lockedBy: null,
          runAfter: now(),
          updatedAt: now(),
        })
        .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - leaseMs))))
        .run();
      const row = db
        .select()
        .from(jobs)
        .where(and(inArray(jobs.status, ["pending", "retry_wait"]), lte(jobs.runAfter, now())))
        .orderBy(asc(jobs.runAfter))
        .get();
      if (!row) return undefined;
      const changed = db
        .update(jobs)
        .set({
          status: "running",
          lockedAt: now(),
          lockedBy: workerId,
          attempts: row.attempts + 1,
          updatedAt: now(),
        })
        .where(and(eq(jobs.id, row.id), inArray(jobs.status, ["pending", "retry_wait"])))
        .run();
      return changed.changes === 1
        ? db.select().from(jobs).where(eq(jobs.id, row.id)).get()
        : undefined;
    })
    .immediate();
}
export function completeJob(id: string) {
  getDatabase()
    .db.update(jobs)
    .set({ status: "completed", lockedAt: null, lockedBy: null, updatedAt: now() })
    .where(eq(jobs.id, id))
    .run();
}
export function deadLetterJob(id: string, category: string, message: string) {
  getDatabase()
    .db.update(jobs)
    .set({
      status: "dead_letter",
      lockedAt: null,
      lockedBy: null,
      lastErrorCategory: category,
      lastErrorMessage: message.slice(0, 500),
      updatedAt: now(),
    })
    .where(eq(jobs.id, id))
    .run();
}
export function failJob(
  id: string,
  category: string,
  message: string,
  retryAfterMs?: number,
): "retry_wait" | "dead_letter" {
  const db = getDatabase().db;
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return "dead_letter";
  const status = row.attempts >= row.maxAttempts ? "dead_letter" : "retry_wait";
  const delay = retryAfterMs ?? Math.min(60_000, 1000 * 2 ** row.attempts);
  db.update(jobs)
    .set({
      status,
      runAfter: new Date(Date.now() + delay),
      lockedAt: null,
      lockedBy: null,
      lastErrorCategory: category,
      lastErrorMessage: message.slice(0, 500),
      updatedAt: now(),
    })
    .where(eq(jobs.id, id))
    .run();
  return status;
}

export function reschedulePendingTranscript(
  id: string,
  message: string,
  retryAfterMs: number,
): void {
  const db = getDatabase().db;
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) return;
  db.update(jobs)
    .set({
      status: "retry_wait",
      // Polling for provider readiness is not a failed execution attempt.
      attempts: Math.max(0, row.attempts - 1),
      runAfter: new Date(Date.now() + retryAfterMs),
      lockedAt: null,
      lockedBy: null,
      lastErrorCategory: "transcript_pending",
      lastErrorMessage: message.slice(0, 500),
      updatedAt: now(),
    })
    .where(eq(jobs.id, id))
    .run();
}

export function reviveDeadJob(id: string): boolean {
  return (
    getDatabase()
      .db.update(jobs)
      .set({
        status: "pending",
        attempts: 0,
        runAfter: now(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCategory: null,
        lastErrorMessage: null,
        updatedAt: now(),
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "dead_letter")))
      .run().changes === 1
  );
}
export function listJobs(limit = 50, sellerId?: string) {
  const all = getDatabase()
    .db.select()
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(limit * 4)
    .all();
  if (!sellerId) return all.slice(0, limit);
  return all
    .filter((job) => {
      try {
        return (JSON.parse(job.payloadJson) as { sellerId?: string }).sellerId === sellerId;
      } catch {
        return false;
      }
    })
    .slice(0, limit);
}
export function listGongInstallations() {
  return getDatabase()
    .db.select()
    .from(installations)
    .where(eq(installations.provider, "gong"))
    .all();
}

export function updateSyncCursor(
  installationId: string,
  stream: string,
  cursor: string | null,
  windowEnd: Date,
) {
  const db = getDatabase().db;
  const existing = db
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.installationId, installationId), eq(syncCursors.stream, stream)))
    .get();
  if (existing)
    db.update(syncCursors)
      .set({ cursor, windowEnd, updatedAt: now() })
      .where(eq(syncCursors.id, existing.id))
      .run();
  else
    db.insert(syncCursors)
      .values({ id: randomUUID(), installationId, stream, cursor, windowEnd })
      .run();
}
export function getSyncCursor(installationId: string, stream: string) {
  return getDatabase()
    .db.select()
    .from(syncCursors)
    .where(and(eq(syncCursors.installationId, installationId), eq(syncCursors.stream, stream)))
    .get();
}

export function purgeTranscriptData(
  olderThan: Date,
  sellerId?: string,
  deliveredOnly = false,
): number {
  const db = getDatabase().db;
  const conditions = [lte(calls.createdAt, olderThan)];
  if (sellerId) conditions.push(eq(calls.sellerId, sellerId));
  if (deliveredOnly) conditions.push(eq(calls.state, "delivered"));
  const oldCallIds = db
    .select({ id: calls.id })
    .from(calls)
    .where(and(...conditions))
    .all()
    .map((row) => row.id);
  if (!oldCallIds.length) return 0;
  return db.delete(transcriptSegments).where(inArray(transcriptSegments.callId, oldCallIds)).run()
    .changes;
}
export function resetDemoData(sellerId: string): void {
  const { db } = getDatabase();
  db.delete(jobs)
    .where(
      or(
        sql`json_extract(${jobs.payloadJson}, '$.sellerId') = ${sellerId}`,
        sql`json_extract(${jobs.payloadJson}, '$.callId') IN (SELECT id FROM calls WHERE seller_id = ${sellerId})`,
      ),
    )
    .run();
  db.delete(sellers).where(eq(sellers.id, sellerId)).run();
}
