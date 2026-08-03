CREATE TABLE `calls` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`external_call_id` text NOT NULL,
	`title` text NOT NULL,
	`gong_url` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`state` text NOT NULL,
	`provider_request_id` text,
	`transcript_available_at` integer,
	`last_error_category` text,
	`last_error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `call_external_uq` ON `calls` (`installation_id`,`external_call_id`);--> statement-breakpoint
CREATE INDEX `call_seller_started_idx` ON `calls` (`seller_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `call_state_idx` ON `calls` (`state`);--> statement-breakpoint
CREATE TABLE `draft_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`summary_id` text NOT NULL,
	`revision` integer NOT NULL,
	`to_json` text NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`summary_id`) REFERENCES `summaries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_revision_uq` ON `draft_revisions` (`call_id`,`revision`);--> statement-breakpoint
CREATE TABLE `email_send_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_revision_id` text NOT NULL,
	`seller_id` text NOT NULL,
	`status` text NOT NULL,
	`sender` text NOT NULL,
	`to_json` text NOT NULL,
	`cc_json` text NOT NULL,
	`subject_snapshot` text NOT NULL,
	`body_snapshot` text NOT NULL,
	`gmail_message_id` text,
	`gmail_thread_id` text,
	`submitted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`draft_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `send_draft_uq` ON `email_send_intents` (`draft_revision_id`);--> statement-breakpoint
CREATE TABLE `evidences` (
	`id` text PRIMARY KEY NOT NULL,
	`summary_id` text NOT NULL,
	`claim` text NOT NULL,
	`segment_ids_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`summary_id`) REFERENCES `summaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_summary_idx` ON `evidences` (`summary_id`);--> statement-breakpoint
CREATE TABLE `gong_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`brief` text,
	`outline_json` text DEFAULT '[]' NOT NULL,
	`highlights_json` text DEFAULT '[]' NOT NULL,
	`outcome` text,
	`key_points_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_call_uq` ON `gong_analyses` (`call_id`);--> statement-breakpoint
CREATE TABLE `installations` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_id` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`external_account_id` text,
	`status` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installation_provider_uq` ON `installations` (`seller_id`,`provider`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`run_after` integer NOT NULL,
	`locked_at` integer,
	`locked_by` text,
	`last_error_category` text,
	`last_error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency_uq` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_claim_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE TABLE `oauth_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`access_token_encrypted` text,
	`refresh_token_encrypted` text,
	`secret_encrypted` text,
	`expires_at` integer,
	`scopes` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_installation_uq` ON `oauth_credentials` (`installation_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`external_id` text NOT NULL,
	`speaker_id` text,
	`name` text NOT NULL,
	`email` text,
	`title` text,
	`affiliation` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participant_external_uq` ON `participants` (`call_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`gong_user_id` text,
	`slack_team_id` text,
	`slack_user_id` text,
	`preferences_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seller_email_uq` ON `sellers` (`email`);--> statement-breakpoint
CREATE TABLE `slack_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_revision_id` text NOT NULL,
	`channel_id` text,
	`message_ts` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`draft_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slack_draft_uq` ON `slack_deliveries` (`draft_revision_id`);--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`revision` integer NOT NULL,
	`summary_json` text NOT NULL,
	`model_id` text NOT NULL,
	`usage_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `summary_revision_uq` ON `summaries` (`call_id`,`revision`);--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`stream` text NOT NULL,
	`cursor` text,
	`window_end` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `installations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_cursor_uq` ON `sync_cursors` (`installation_id`,`stream`);--> statement-breakpoint
CREATE TABLE `transcript_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`call_id` text NOT NULL,
	`external_segment_id` text NOT NULL,
	`speaker_id` text NOT NULL,
	`speaker_name` text NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`text` text NOT NULL,
	`topic` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`call_id`) REFERENCES `calls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `segment_external_uq` ON `transcript_segments` (`call_id`,`external_segment_id`);--> statement-breakpoint
CREATE INDEX `segment_call_start_idx` ON `transcript_segments` (`call_id`,`start_ms`);