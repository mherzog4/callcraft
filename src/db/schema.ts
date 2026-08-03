import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const sellers = sqliteTable(
  "sellers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    gongUserId: text("gong_user_id"),
    slackTeamId: text("slack_team_id"),
    slackUserId: text("slack_user_id"),
    preferencesJson: text("preferences_json").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("seller_email_uq").on(table.email),
    uniqueIndex("seller_slack_identity_uq").on(table.slackTeamId, table.slackUserId),
  ],
);

export const installations = sqliteTable(
  "installations",
  {
    id: text("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["gong", "slack", "google", "openrouter"] }).notNull(),
    mode: text("mode", { enum: ["demo", "real"] }).notNull(),
    externalAccountId: text("external_account_id"),
    status: text("status", { enum: ["connected", "disconnected", "error"] }).notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [uniqueIndex("installation_provider_uq").on(table.sellerId, table.provider)],
);

export const oauthCredentials = sqliteTable(
  "oauth_credentials",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    secretEncrypted: text("secret_encrypted"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    scopes: text("scopes").notNull().default(""),
    ...timestamps,
  },
  (table) => [uniqueIndex("credential_installation_uq").on(table.installationId)],
);

export const calls = sqliteTable(
  "calls",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "cascade" }),
    externalCallId: text("external_call_id").notNull(),
    title: text("title").notNull(),
    gongUrl: text("gong_url").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    state: text("state", {
      enum: [
        "discovered",
        "awaiting_transcript",
        "ready",
        "extracting",
        "drafting",
        "delivering",
        "delivered",
        "retry_wait",
        "dead_letter",
      ],
    }).notNull(),
    providerRequestId: text("provider_request_id"),
    transcriptAvailableAt: integer("transcript_available_at", { mode: "timestamp_ms" }),
    lastErrorCategory: text("last_error_category"),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("call_external_uq").on(table.installationId, table.externalCallId),
    index("call_seller_started_idx").on(table.sellerId, table.startedAt),
    index("call_state_idx").on(table.state),
    check(
      "call_state_ck",
      sql`${table.state} in ('discovered','awaiting_transcript','ready','extracting','drafting','delivering','delivered','retry_wait','dead_letter')`,
    ),
  ],
);

export const gongAnalyses = sqliteTable(
  "gong_analyses",
  {
    id: text("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    brief: text("brief"),
    outlineJson: text("outline_json").notNull().default("[]"),
    highlightsJson: text("highlights_json").notNull().default("[]"),
    outcome: text("outcome"),
    keyPointsJson: text("key_points_json").notNull().default("[]"),
    ...timestamps,
  },
  (table) => [uniqueIndex("analysis_call_uq").on(table.callId)],
);

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    speakerId: text("speaker_id"),
    name: text("name").notNull(),
    email: text("email"),
    title: text("title"),
    affiliation: text("affiliation").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("participant_external_uq").on(table.callId, table.externalId)],
);

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    externalSegmentId: text("external_segment_id").notNull(),
    speakerId: text("speaker_id").notNull(),
    speakerName: text("speaker_name").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    topic: text("topic"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("segment_external_uq").on(table.callId, table.externalSegmentId),
    index("segment_call_start_idx").on(table.callId, table.startMs),
  ],
);

export const syncCursors = sqliteTable(
  "sync_cursors",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => installations.id, { onDelete: "cascade" }),
    stream: text("stream").notNull(),
    cursor: text("cursor"),
    windowEnd: integer("window_end", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("sync_cursor_uq").on(table.installationId, table.stream)],
);

export const summaries = sqliteTable(
  "summaries",
  {
    id: text("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    summaryJson: text("summary_json").notNull(),
    modelId: text("model_id").notNull(),
    usageJson: text("usage_json").notNull().default("{}"),
    ...timestamps,
  },
  (table) => [uniqueIndex("summary_revision_uq").on(table.callId, table.revision)],
);

export const evidences = sqliteTable(
  "evidences",
  {
    id: text("id").primaryKey(),
    summaryId: text("summary_id")
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    claim: text("claim").notNull(),
    segmentIdsJson: text("segment_ids_json").notNull(),
    ...timestamps,
  },
  (table) => [index("evidence_summary_idx").on(table.summaryId)],
);

export const draftRevisions = sqliteTable(
  "draft_revisions",
  {
    id: text("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    summaryId: text("summary_id")
      .notNull()
      .references(() => summaries.id),
    revision: integer("revision").notNull(),
    toJson: text("to_json").notNull(),
    ccJson: text("cc_json").notNull().default("[]"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    source: text("source", { enum: ["generated", "edited", "regenerated"] }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("draft_revision_uq").on(table.callId, table.revision)],
);

export const slackDeliveries = sqliteTable(
  "slack_deliveries",
  {
    id: text("id").primaryKey(),
    draftRevisionId: text("draft_revision_id")
      .notNull()
      .references(() => draftRevisions.id),
    channelId: text("channel_id"),
    messageTs: text("message_ts"),
    status: text("status", { enum: ["pending", "delivered", "failed"] }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("slack_draft_uq").on(table.draftRevisionId)],
);

export const emailSendIntents = sqliteTable(
  "email_send_intents",
  {
    id: text("id").primaryKey(),
    draftRevisionId: text("draft_revision_id")
      .notNull()
      .references(() => draftRevisions.id),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    status: text("status", {
      enum: ["pending_confirmation", "confirmed", "submitting", "submitted", "failed", "unknown"],
    }).notNull(),
    sender: text("sender").notNull(),
    toJson: text("to_json").notNull(),
    ccJson: text("cc_json").notNull(),
    subjectSnapshot: text("subject_snapshot").notNull(),
    bodySnapshot: text("body_snapshot").notNull(),
    gmailMessageId: text("gmail_message_id"),
    gmailThreadId: text("gmail_thread_id"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("send_draft_uq").on(table.draftRevisionId)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type", {
      enum: [
        "discover_calls",
        "fetch_call",
        "extract_summary",
        "compose_draft",
        "deliver_slack",
        "send_email",
        "cleanup",
      ],
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status", {
      enum: ["pending", "running", "retry_wait", "completed", "dead_letter"],
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAfter: integer("run_after", { mode: "timestamp_ms" }).notNull(),
    lockedAt: integer("locked_at", { mode: "timestamp_ms" }),
    lockedBy: text("locked_by"),
    lastErrorCategory: text("last_error_category"),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("job_idempotency_uq").on(table.idempotencyKey),
    index("job_claim_idx").on(table.status, table.runAfter),
    index("job_lease_idx").on(table.status, table.lockedAt),
    check(
      "job_type_ck",
      sql`${table.type} in ('discover_calls','fetch_call','extract_summary','compose_draft','deliver_slack','send_email','cleanup')`,
    ),
    check(
      "job_status_ck",
      sql`${table.status} in ('pending','running','retry_wait','completed','dead_letter')`,
    ),
    check("job_attempts_ck", sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0`),
  ],
);
