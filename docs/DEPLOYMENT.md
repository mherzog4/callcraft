# Single-host deployment and evaluator setup

CallCraft's operational application is a stateful web process plus a durable worker sharing one SQLite database. The Vercel project hosts only the static marketing site. Do not deploy the operational application to a serverless platform without replacing SQLite and the queue.

## Recommended hosted demo: Railway

Deploy one Railway service with one replica and a persistent volume mounted at `/data`. The checked-in `railway.json` uses the Dockerfile, gates deployments on `/api/health`, and restarts failures. The image entrypoint prepares the mounted volume, drops privileges, and starts migrations plus the web and worker processes in one supervised container. See the complete [Railway deployment guide](./RAILWAY.md).

A hosted Railway service replaces the need for Cloudflare Tunnel. Point `callcraft.mattherzog.xyz` to the Railway-provided CNAME and keep SQLite-backed web and worker processes together.

## Fast local evaluator setup

1. Start a temporary HTTPS endpoint:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

2. Prepare or update `.env` without printing generated secrets:

   ```bash
   npm run evaluation:setup -- --app-url https://YOUR-HOST.trycloudflare.com
   ```

3. Add the Slack, Google, and optional CLI OpenRouter credentials described in [`EVALUATION.md`](./EVALUATION.md).
4. Validate configuration:

   ```bash
   npm run evaluation:doctor
   ```

5. Build, migrate, and start web plus worker with one command:

   ```bash
   npm run evaluation:start
   ```

The tunnel remains a separate process because its random URL must be known before Slack and Google callback configuration. When the Quick Tunnel hostname changes, rerun `evaluation:setup`, update both provider consoles, and restart CallCraft.

After completing the live flow:

```bash
npm run acceptance:verify
```

The verifier inspects local state without calling providers. It requires the evaluation provider matrix, synthetic Gong-only calls, a delivered Slack workflow, a Gmail-submitted immutable intent with a provider message ID, non-reserved recipients, and one intent per draft revision. Receipt/delivery must still be checked in evaluator-owned Gmail accounts.

Cloudflare Tunnel is only a bridge for Slack callbacks when the application runs on a local machine. It is not needed for Railway or another public single-host deployment.

## Docker Compose on one host

```bash
cp .env.example .env
# Configure APP_MODE and strong/provider secrets.
docker compose up --build
```

The web and worker share the `callcraft-data` volume, run as numeric UID/GID 1000, and gate worker startup on the web health check. Put a TLS reverse proxy in front of port 3000 and set `APP_URL` to its public HTTPS origin. Slack and Google callback URLs must exactly match that origin.

Operational requirements:

- one host and one persistent local filesystem;
- encrypted disk/volume and restricted operator access;
- backups with expiry aligned to transcript retention;
- health checks against `/api/health`;
- restart policies for web and worker;
- log shipping that preserves CallCraft's redaction policy; and
- monitoring for dead-letter jobs, Gmail `unknown` outcomes, OAuth reconnect state, OpenRouter latency/cost, and disk growth.

## Backups

```bash
npm run db:backup                       # writes data/backups/app-<timestamp>.db
npm run db:backup -- --out /path/to.db  # or an explicit destination
```

The script uses SQLite `VACUUM INTO` rather than copying the file. Two reasons, both load-bearing:

- The database runs in WAL mode, so a plain copy of a live file can capture a torn state.
- `VACUUM INTO` writes a compacted file, so free pages that may still hold deleted transcript text do not survive into the backup. A raw copy would quietly contradict the retention promise in the README.

Every backup is reopened and checked before the command reports success — `integrity_check`, required tables, and row counts — so a corrupt snapshot fails at backup time rather than during a restore that is already an emergency.

Restore into a scratch path and confirm the application starts against it before trusting a backup:

```bash
DATABASE_PATH=/tmp/restore-check.db npm run db:migrate
```

Store backups on encrypted storage with an expiry aligned to `TRANSCRIPT_RETENTION_DAYS`; a backup that outlives the retention window reintroduces the data the cleanup job deleted. Schedule the command with the host's scheduler (Railway cron, systemd timer, or `cron`).

## Crash visibility

The worker installs handlers for `uncaughtException` and `unhandledRejection`. Each logs a `fatal` structured event and exits non-zero so the supervisor restarts the process — a worker that survives an unhandled rejection processes nothing while looking alive.

Set `ERROR_WEBHOOK_URL` to receive those reports as a JSON POST. It is deliberately a plain webhook rather than a vendor SDK: any tracker, chat channel, or alert router accepts one, and a self-hoster owes nothing to a third party to run this. Reports contain the component, the reason, the error name, and stack frames — never error messages, which can quote a transcript line, a recipient, or a credential that failed to parse.

## Production evolution

SQLite is intentional for a cloneable reference implementation and single-host demo. Before horizontal scaling:

1. move the Drizzle repository to PostgreSQL;
2. replace queue claims with `FOR UPDATE SKIP LOCKED` or a managed queue;
3. store credentials in a managed secret/KMS boundary;
4. use durable object storage for eval artifacts if required;
5. add provider-specific SLOs and alerting; and
6. complete live Gong contract/smoke testing in an authorized tenant.

The adapter and workflow contracts are designed to remain stable across that migration.

## Honest scope

The repository includes a real Gong HTTP adapter and contract tests, but the maintainer's live demo uses the seeded Gong-compatible adapter because no Gong tenant is available. Present the project as a production-minded reference implementation, not as a fully verified Gong product. Real OpenRouter, Slack, and Gmail behavior should be demonstrated only with evaluator-owned accounts and explicit email confirmation.
