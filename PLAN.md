# Gong Transcript Follow-Up Email Prototype Plan

## Context

Build an open-source, production-minded application that syncs completed Gong sales calls, drafts relevant follow-up emails grounded in their transcripts, and sends the drafts privately to each seller in Slack. The first release should be a polished, realistic prototype without locking the core workflow to Gong, OpenRouter, Slack, or one deployment platform.

Current repository state: empty; the project will be bootstrapped from scratch after this plan is approved.

### Intended outcome

- Turn a transcript plus optional user guidance into an editable follow-up email draft.
- Show Gong-provided call context alongside the draft so the seller can verify and improve it.
- Ground the draft in call facts, decisions, objections, and next steps rather than inventing details.
- Let the seller explicitly confirm and send the current revision from Slack through their connected Gmail inbox, without copy/paste.
- Make generation and sending observable, testable, secure, and extensible enough for an OSS release.
- Demonstrate the complete workflow without paid credentials while keeping the real Gong, OpenRouter, Slack, and Gmail connector paths deployable.

### Confirmed product direction

- Primary users are individual sellers.
- The mockup should exercise a realistic Gong connection rather than only accepting pasted text.
- Draft review and actions should happen in Slack; confirmed messages should be sent through the seller's connected Gmail account and appear in Gmail Sent.
- Gmail is the first email transport; keep a provider interface so Microsoft Graph/Outlook can be added later.
- OpenRouter will provide model access.
- SQLite is the preferred initial datastore, subject to the deployment constraints below.

### Confirmed MVP decisions

- Ship both a seeded demo workspace and a real Gong connector; no real Gong credentials are available during development.
- Send the email draft privately to the seller in Slack and support Edit, Regenerate, View context/evidence, and Send interactions there.
- A Slack **Send email** action must open a confirmation modal showing the connected sender, recipients, subject, and current body; sending is never automatic.
- Connect Gmail with OAuth using least-privilege send access; the seeded demo uses a non-delivering mail preview transport.
- Make transcript retention configurable, with a privacy-oriented default and scheduled cleanup.
- Make Docker an optional deployment path, not a prerequisite for local development.
- Automatically generate and deliver a draft when a completed call's transcript becomes available; retain manual Generate/Regenerate controls for recovery and revision.

## Approach

Recommended baseline:

1. Build a Next.js/TypeScript application with a responsive onboarding and operations UI. Use Slack OAuth installation to establish the workspace/seller mapping and a signed HTTP-only session for the web UI; let the seller choose a Gong identity and configure generation preferences.
2. Model Gong as a production connector using its current public API contract:
   - accept a tenant-specific base URL plus Access Key/Secret using Basic auth for v1, while keeping auth replaceable with Gong OAuth later;
   - use `GET /v2/users` to select/match the seller, `GET /v2/calls` for date-window discovery, `POST /v2/calls/extensive` for participant identity plus available Gong `brief`, `outline`, `highlights`, `callOutcome`, and `keyPoints`, and `POST /v2/calls/transcript` for speaker-linked monologues/sentences;
   - honor Gong's cursor pagination, additive response fields, request IDs, default 3 requests/second and 10,000 requests/day limits, and `429 Retry-After` behavior;
   - poll incrementally because transcript availability may lag call completion, using overlapping time windows plus external-ID uniqueness for safe deduplication.
3. Implement a seeded Gong adapter with the exact same normalized contract and realistic Gong-shaped fixtures. Include multiple cursor pages, internal/external participants, a Gong brief/key points/outcome, timestamped sentence segments, a transcript-pending call, and opt-in simulated `429`/provider failures. Clearly label demo data and never silently fall back from a failed real connection to mock data.
4. Deliver each generated draft to the seller's Slack DM/App Home using Block Kit. Show recipient, subject, body, call title/time, generation status, and a compact **Gong context** section sourced from Gong's brief/outcome/key points. Keep that separate and labeled; if Gong analysis is unavailable, show the evidence-backed OpenRouter summary as **Generated context** instead. Provide **Edit** (Slack modal), **Regenerate**, **View full context/evidence**, **Open in Gong**, and **Send email** actions.
5. Implement Gmail as the first `EmailSender` adapter:
   - connect the seller with Google OAuth and request identity plus `gmail.send` only; encrypt access/refresh tokens and support refresh, disconnect, and revoked-consent recovery;
   - derive initial recipients from external Gong participants but require the seller to review valid To/Cc addresses;
   - have **Send email** open a Slack confirmation modal containing the exact immutable draft revision, sender, recipients, subject, and body; on confirmation, enqueue a send job and acknowledge Slack immediately;
   - send RFC 5322/MIME through Gmail `users.messages.send`, persist the Gmail message/thread identifiers and accepted timestamp, and update the original Slack message to Sending/Sent/Failed;
   - prevent duplicate sends with a unique send-intent/idempotency record, disable sending after success, and require an explicit new revision/resend flow for another message;
   - never auto-send after generation, and never claim delivery/read confirmation because Gmail API acceptance only proves the message was submitted;
   - provide a clearly labeled preview transport that records the MIME message locally in seeded demo mode and cannot contact Gmail.
6. Use a two-stage LLM workflow through OpenRouter with a model ID supplied by configuration:
   - extract a typed, evidence-backed call summary (participants, pains, decisions, objections, commitments, and next steps);
   - generate the email only from that structured summary and user preferences.
7. Treat transcript text and Gong analysis fields as untrusted data, require schema-valid structured output, and use segment IDs/timestamps as evidence citations. Generate only from validated context, flag uncertainty, and never follow instructions found inside a transcript or Gong summary.
8. Define provider-neutral interfaces for transcript sources, model generation, draft destinations, and email senders; implement Gong, OpenRouter, Slack, and Gmail as the first adapters.
9. Use Drizzle with `better-sqlite3` behind repositories for local development and single-instance deployments. Enable WAL mode, foreign keys, migrations, indexes, and transactional job claiming. Document that multi-instance/serverless deployments should switch to PostgreSQL; avoid SQLite-specific business logic outside the database adapter.
10. Run polling sync, automatic generation/Slack delivery, seller-confirmed email sending, manual recovery, and retention cleanup through a durable SQLite job queue processed by a separate worker command. A discovered call remains in `awaiting_transcript` and is retried until Gong returns transcript content; the first available transcript atomically queues one generation job. Local development can run web and worker commands together; provide an optional Docker Compose profile with a persistent SQLite volume rather than requiring Docker.
11. Encrypt Gong, Slack, and Google credentials at rest with an application master key, never log transcript/email bodies or secrets, and add request IDs, idempotency keys, per-user rate limits, timeouts, retries/backoff, and dead-letter visibility.
12. Make retention a seller setting (`delete after successful Slack delivery` or a bounded number of days), default to seven days for transcript text, and let the cleanup job remove raw text while retaining minimal call, draft, and send-audit metadata. Document backup implications and hard-deletion limits.
13. Prepare the repository for OSS use with documentation, `.env.example`, seed data, an MIT license, security policy, contribution instructions, and GitHub Actions CI. Document that public Gmail OAuth deployments may require Google app verification, while local/demo mode needs no Google credentials.

## Files to modify

The repository is empty, so implementation will create these critical paths:

- `package.json`, `tsconfig.json`, `next.config.ts` — Next.js/TypeScript project and quality scripts
- `app/(dashboard)/` — onboarding, integration health, calls, draft history, and settings pages
- `app/api/slack/oauth/{start,callback}/route.ts` — signed Slack installation and seller session setup
- `app/api/slack/interactions/route.ts` — signature-verified Slack actions, edit/send confirmation modals, and submissions
- `app/api/google/oauth/{start,callback}/route.ts` — Gmail OAuth connection and consent callback
- `app/api/jobs/` or authenticated server actions — manual sync/generate/send recovery operations
- `src/integrations/gong/{types,client,real,mock,normalize}.ts` — real API and realistic seeded adapter
- `src/integrations/gong/fixtures/` — Gong-shaped seeded users, calls, extensive-call context, and transcripts
- `src/integrations/slack/` — OAuth/token handling, Block Kit context/draft rendering, DM delivery, and interactions
- `src/integrations/email/{types,gmail,preview}.ts` — provider-neutral send contract, Gmail API adapter, and non-delivering demo preview
- `src/integrations/openrouter/` — provider client, schemas, timeout, and usage metadata
- `src/generation/` — transcript hardening, structured extraction, grounding validation, and composition
- `src/db/{client,schema,repositories}.ts`, `drizzle/` — SQLite configuration and migrations
- `src/jobs/`, `scripts/worker.ts` — idempotent sync/generation/delivery/cleanup jobs
- `src/security/` — credential encryption, session/state signing, request verification, and redaction
- `src/env.ts`, `.env.example` — validated runtime configuration
- `tests/{unit,contract,integration,e2e}/` — fixtures and automated coverage
- `Dockerfile`, `compose.yaml` — optional single-instance deployment with a persistent volume
- `.github/workflows/ci.yml`, `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` — OSS release materials

## Reuse

No existing application code is available. Reuse established libraries: Next.js/React for the web app, Zod for validation, Drizzle plus `better-sqlite3` for persistence, the official Slack Web API SDK for delivery, Google's official APIs client for OAuth and Gmail `users.messages.send`, a maintained MIME composer for standards-compliant messages, an OpenRouter-compatible AI SDK/provider for structured generation, Pino for redacted structured logs, Vitest/MSW for unit and adapter tests, and Playwright for browser flows. Use Node's crypto primitives for authenticated credential encryption rather than inventing cryptography.

The Gong OpenAPI documentation confirms the relevant endpoint shapes, Basic and OAuth auth options, speaker-to-party linkage, cursor semantics, rate limits, and optional call-analysis fields (`brief`, `outline`, `highlights`, `callOutcome`, and `keyPoints`) exposed by `POST /v2/calls/extensive`. Check in only purpose-built synthetic fixtures modeled on those shapes; do not copy proprietary customer transcripts or depend on the remote API specification at runtime.

## Steps

- [x] Record the automatic event flow and lifecycle state machine: call discovered → awaiting transcript → ready → extracting → drafting → delivering → delivered, with retry/dead-letter states and manual Generate/Regenerate transitions.
- [x] Bootstrap Next.js/TypeScript with package-manager pinning, formatting, linting, strict type checking, Vitest, Playwright, and CI.
- [x] Add validated environment loading and a first-run setup flow for Slack, Gmail, OpenRouter, demo/real Gong mode, seller identity, writing preferences, and retention.
- [x] Define canonical seller, installation, OAuth credential, call, Gong analysis/context, participant, transcript segment, sync cursor, summary/evidence, draft revision, Slack delivery, email send intent, and job schemas with explicit lifecycle states.
- [x] Add Drizzle migrations and repositories; configure SQLite WAL/foreign keys/busy timeout, transactional writes/job claims, uniqueness constraints, and indexes.
- [x] Implement the real Gong client and adapter for users, basic calls, extensive participant/brief/outline/highlight/outcome/key-point data, and transcripts; validate only consumed fields while tolerating additions, preserve Gong request IDs, throttle requests, follow cursors, honor `Retry-After`, and checkpoint overlapping sync windows.
- [x] Build the seeded Gong mode through the same adapter contract, including realistic pagination, participants/speakers, Gong-provided context, pending transcript availability, failures, and a demo reset action.
- [x] Implement the SQLite worker workflow: discover call → fetch Gong context/participant/transcript data → extract summary → compose draft → deliver Slack message; add a separate seller-confirmed send intent → Gmail submission transition and apply retention, with idempotency and bounded retry/dead-letter handling at each step.
- [x] Implement OpenRouter structured extraction and composition with configurable model ID, Zod validation/repair limits, usage capture, transcript/Gong-context prompt-injection defenses, evidence checks, and safe error categories.
- [x] Implement Slack OAuth with signed state, encrypted bot tokens, private DM/App Home delivery, request-signature verification, fast interaction acknowledgement, Gong context rendering, Edit modal, Regenerate, View context/evidence, Open in Gong, and Send email actions; update existing messages instead of duplicating them.
- [x] Implement Google OAuth and the Gmail sender with least-privilege scopes, encrypted refresh tokens, reconnect/disconnect behavior, RFC 5322/MIME construction, recipient validation, immutable revision-bound confirmation, send idempotency, and Slack status updates; implement a non-networked preview sender for demo mode.
- [x] Build dashboard pages for onboarding, integration health, seller mapping, recent calls/status, draft history/revisions, preferences, retention, retry visibility, and demo reset.
- [x] Add credential encryption, session cookies, CSRF/OAuth-state protection, redacted structured logging, request IDs, size/rate limits, and a cleanup job for the selected retention policy.
- [x] Add unit, adapter-contract, integration, migration, worker-recovery, security, and browser tests; mock Gong, OpenRouter, Slack, Google OAuth, and Gmail in default CI and gate optional real-provider smoke tests behind secrets.
- [x] Document local non-Docker startup, optional Compose deployment, Slack app setup, Gong API-key setup, OpenRouter configuration, Google OAuth/Gmail setup and verification caveats, demo walkthrough, architecture, privacy model, SQLite limits/PostgreSQL migration path, and OSS contribution/security processes.

## Verification

- Run formatter, linter, type checker, unit/integration tests, production build, and end-to-end smoke tests in CI.
- Exercise representative fixtures: clean transcript, noisy or unknown speakers, long call, pending transcript, missing next steps, contradictory statements, transcript-embedded prompt injection, and sensitive information.
- Confirm every material generated claim maps to extracted transcript evidence or is clearly marked as user-provided.
- Confirm malformed model output, provider timeout/rate limit, oversized input, and cancelled requests fail safely and produce actionable UI states.
- Verify no transcript/Gong context, generated email body, recipient address, or credentials appear in logs; confirm credential ciphertext cannot be used without the master key and retention modes delete raw segments on schedule.
- Run adapter contract tests against synthetic Gong-shaped fixtures, OpenRouter structured responses, Slack signature/message fixtures, Google OAuth token refresh/revocation, Gmail API responses, and preview MIME output; optionally run credential-gated smoke tests outside pull-request CI.
- Verify polling discovers a completed call before its transcript is ready, retries without busy-looping, automatically generates exactly once when the transcript appears, and delivers the Slack draft without seller action.
- Verify repeated Gong responses, polling overlaps, manual retries, worker restarts, and Slack retries do not create duplicate calls, generation jobs, drafts, or messages.
- Verify double-clicked/replayed Slack send submissions, Gmail timeouts with ambiguous outcomes, worker restarts, and token refreshes do not send duplicate email; require safe manual reconciliation rather than blind retry after an ambiguous Gmail result.
- Verify Slack displays Gong's brief/outcome/key points when available, clearly labels generated fallback context when unavailable, and opens transcript evidence for material draft claims.
- Manually complete the primary real-mode flow on desktop and mobile: connect Gong, Slack, OpenRouter, and Gmail → sync call → receive summary and draft → edit → confirm sender/recipients/content → send → observe the exact message in Gmail Sent and the Slack status update.
- Validate a clean clone can be configured from `.env.example`, migrated, seeded, tested, built, and run using only README instructions, both without Docker and with the optional Compose setup.
- Confirm the seeded demo works without Gong, Slack, or Google credentials by using explicit local Slack and email preview transports; inspect the generated MIME message and confirm real mode never silently uses demo data or preview senders.
