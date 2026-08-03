PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
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
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "job_type_ck" CHECK("__new_jobs"."type" in ('discover_calls','fetch_call','extract_summary','compose_draft','deliver_slack','send_email','cleanup')),
	CONSTRAINT "job_status_ck" CHECK("__new_jobs"."status" in ('pending','running','retry_wait','completed','dead_letter')),
	CONSTRAINT "job_attempts_ck" CHECK("__new_jobs"."attempts" >= 0 and "__new_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "type", "idempotency_key", "payload_json", "status", "attempts", "max_attempts", "run_after", "locked_at", "locked_by", "last_error_category", "last_error_message", "created_at", "updated_at") SELECT "id", "type", "idempotency_key", "payload_json", "status", "attempts", "max_attempts", "run_after", "locked_at", "locked_by", "last_error_category", "last_error_message", "created_at", "updated_at" FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `job_idempotency_uq` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_claim_idx` ON `jobs` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `job_lease_idx` ON `jobs` (`status`,`locked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `seller_slack_identity_uq` ON `sellers` (`slack_team_id`,`slack_user_id`);--> statement-breakpoint
CREATE TABLE `__new_calls` (
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
	FOREIGN KEY (`seller_id`) REFERENCES `sellers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "call_state_ck" CHECK("__new_calls"."state" in ('discovered','awaiting_transcript','ready','extracting','drafting','delivering','delivered','retry_wait','dead_letter'))
);
--> statement-breakpoint
INSERT INTO `__new_calls`("id", "installation_id", "seller_id", "external_call_id", "title", "gong_url", "started_at", "duration_seconds", "state", "provider_request_id", "transcript_available_at", "last_error_category", "last_error_message", "created_at", "updated_at") SELECT "id", "installation_id", "seller_id", "external_call_id", "title", "gong_url", "started_at", "duration_seconds", "state", "provider_request_id", "transcript_available_at", "last_error_category", "last_error_message", "created_at", "updated_at" FROM `calls`;--> statement-breakpoint
DROP TABLE `calls`;--> statement-breakpoint
ALTER TABLE `__new_calls` RENAME TO `calls`;--> statement-breakpoint
CREATE UNIQUE INDEX `call_external_uq` ON `calls` (`installation_id`,`external_call_id`);--> statement-breakpoint
CREATE INDEX `call_seller_started_idx` ON `calls` (`seller_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `call_state_idx` ON `calls` (`state`);