# Live Slack and Gmail evaluation without Gong

## Context

CallCraft's seeded demo currently validates the workflow locally, but `DEMO_MODE=true` intentionally disables real Slack OAuth/interactions, Google OAuth/Gmail, and OpenRouter. Switching to `DEMO_MODE=false` enables those providers, but the current setup flow then requires real Gong credentials. Therefore, a seller without a Gong account cannot yet run the exact target evaluation: seeded Gong transcript data flowing through real Slack review and a real Gmail send.

The intended outcome is a safe evaluation configuration that uses synthetic Gong data while exercising the real Slack and Gmail integrations end-to-end. The public Vercel deployment remains marketing-only; the operational app needs one persistent host for both SQLite and the worker.

## Approach

- Add an explicit **evaluation mode** that permits provider-by-provider adapter selection instead of treating demo versus real as one global switch.
- Use seeded Gong fixtures as the transcript source, while connecting the evaluator's real Slack workspace and Gmail account.
- Use real OpenRouter generation in evaluation mode so the only synthetic upstream is Gong. Make every provider's synthetic versus networked status visible in Settings.
- Run the web app and worker locally on one machine with persistent SQLite. Expose the web process through a Cloudflare Tunnel HTTPS URL so Slack and Google can reach OAuth callbacks and Slack interactions.
- Preserve all existing safeguards: synthetic-only call data, explicit Gmail confirmation, encrypted OAuth credentials, seller/session binding, and no silent fallback from real integrations.

## Files to modify

- `src/env.ts`, `.env.example`, and test/Playwright environment setup — add an explicit `APP_MODE=demo|evaluation|production` policy while providing a documented migration from `DEMO_MODE`
- `src/demo/seed.ts` and `src/jobs/setup.ts` — separate the fixed all-local demo seller from attaching only seeded Gong data to an OAuth-authenticated evaluation seller
- `src/web/auth.ts` plus a central provider-policy helper — allow only the intended adapter matrix in each app mode
- `app/settings/page.tsx` and `app/api/setup/route.ts` — in evaluation mode, omit Gong credentials/user mapping, identify Gong as seeded, and configure encrypted real OpenRouter credentials
- `app/api/slack/oauth/start/route.ts`, `app/api/slack/oauth/callback/route.ts`, `app/api/slack/interactions/route.ts`, and Google OAuth routes — allow real OAuth/interactions in evaluation and production, but not demo
- `src/jobs/worker.ts` — enforce the central provider policy for seeded Gong plus real OpenRouter/Slack/Gmail
- `README.md`, `docs/slack-manifest.yaml`, and a focused evaluation runbook under `docs/` — exact Slack, Google, OpenRouter, temporary Cloudflare Tunnel, worker, and acceptance-test steps
- `tests/integration/setup.test.ts`, `tests/integration/worker.test.ts`, security/route tests, and Playwright configuration — mixed-mode policy and workflow coverage

## Reuse

- `src/integrations/gong/mock.ts` and `src/integrations/gong/fixtures.ts` — existing paginated calls, participants, Gong context, pending transcript, and failure simulation
- `src/integrations/openrouter/index.ts` — existing validated real generator and strict no-fallback adapter selection
- `src/integrations/slack/client.ts`, `src/integrations/slack/render.ts`, and `src/integrations/slack/signature.ts` — real DM delivery, edit/confirmation modals, and signed interaction verification
- `src/integrations/email/gmail.ts` — existing least-privilege Gmail sender and MIME construction
- `app/api/slack/oauth/callback/route.ts` — existing Slack identity bootstrap, seller binding, encrypted bot token, and signed session
- `app/api/google/oauth/callback/route.ts` — existing seller-bound Google identity and encrypted refresh token storage
- `docs/slack-manifest.yaml` — existing Slack scopes and endpoint template
- Existing immutable revision-bound send intents, idempotent Gmail submission, worker leases/recovery, redacted logging, and transcript retention

## Steps

- [x] Use a local web process and worker with a temporary Cloudflare Tunnel HTTPS endpoint.
- [x] Use real OpenRouter generation in the evaluation.
- [x] Add a central `demo | evaluation | production` policy. Permit only: all preview/seeded adapters in demo; seeded Gong plus real OpenRouter/Slack/Gmail in evaluation; all real adapters in production. Reject invalid combinations at startup/adapter creation and never fall back after a real-provider failure.
- [x] Refactor demo seeding so evaluation attaches a connected seeded Gong installation to the seller created by Slack OAuth, without creating demo Slack/Google/OpenRouter installations or a second fixed seller. Delay discovery until real OpenRouter setup is complete (or the seller explicitly clicks Sync) so jobs do not fail during onboarding.
- [x] Update Settings/setup to show “Seeded Gong — synthetic data,” require/store the real OpenRouter key/model, expose real Slack/Gmail connection state, and keep reset scoped to synthetic call/job data without disconnecting OAuth accounts.
- [x] Allow Slack OAuth, signed interactions, Google OAuth, and Gmail sending in evaluation mode; retain all seller/team ownership checks, encrypted credentials, exact-revision confirmation, idempotency, and ambiguous-send handling.
- [x] Make synthetic-call status unmistakable in the dashboard and Slack message. Keep the fixture's reserved `.example.org` recipient safe; the runbook must require using Edit to replace it with an evaluator-owned address before confirmation, and the UI should warn/block confirmation while reserved example-domain recipients remain.
- [x] Add policy, setup, worker, OAuth/interaction, and send-confirmation tests proving evaluation mode permits only the intended provider mix and performs no silent fallback. Keep default CI fully mocked; the real-provider smoke test remains manual and secret-gated.
- [x] Create the local runbook: install `cloudflared`; start `cloudflared tunnel --url http://localhost:3000`; copy the generated HTTPS hostname into `APP_URL`; generate strong `MASTER_KEY`/`SESSION_SECRET`; and explain that a new temporary hostname requires restarting web/worker and updating every provider callback.
- [x] In the runbook, create/configure: an OpenRouter API key/model; a Slack app from `docs/slack-manifest.yaml` with the tunnel OAuth redirect and interactivity URL; and a Google Cloud OAuth web client with Gmail API enabled, consent screen in Testing, the evaluator added as a test user, and the exact tunnel callback URI.
- [ ] Run migrations, start the web process and `npm run worker -- --watch`, connect Slack first, save OpenRouter setup, connect Gmail, click Sync, and execute the end-to-end acceptance test using only evaluator-owned sender/recipient accounts.

## Verification

- Run `npm run check` and `npm run test:e2e`; verify the existing all-local demo and production configuration tests still pass.
- Start from an empty evaluation database and confirm Slack OAuth creates one seller; Settings shows seeded Gong, real Slack, real OpenRouter, and eventually real Gmail with no Gong credential prompt.
- Click Sync and confirm only synthetic Gong calls/transcripts enter the database, while OpenRouter receives the configured model request and every material claim maps to transcript evidence.
- Confirm a draft reaches only the evaluator's private Slack DM/App Home and Edit, Regenerate, context/evidence, and confirmation actions work. Confirm the message is visibly labeled synthetic and does not imply a usable Gong deep link.
- Verify Send is blocked while the reserved fixture recipient remains. Edit To to an evaluator-owned address, review the exact sender/To/Cc/subject/body confirmation, and verify Gmail receives nothing before confirmation.
- Confirm one confirmed message appears in the connected Gmail Sent folder and Slack changes to **Submitted** (not delivered/read). Confirm duplicate confirmation does not create a second Gmail send.
- Exercise Gmail disconnect/reconnect, invalid/stale Slack signatures, worker restart/idempotency, and the documented ambiguous submission state.
- Inspect logs and persisted previews/state for secret or content leakage; run retention cleanup and confirm raw seeded transcript data is removed according to policy.
- Restart with a new Quick Tunnel URL and verify the runbook correctly calls out all required `APP_URL`, Slack OAuth/interactivity, and Google redirect updates.
