# Railway deployment

Railway is the recommended always-on host for the CallCraft evaluation demo. The repository-level [`railway.json`](../railway.json) selects the Dockerfile build, checks `/api/health`, and restarts failed deployments. The image entrypoint prepares the runtime volume and launches the supervised standalone web server and durable worker.

## Why one Railway service

CallCraft intentionally uses SQLite for its single-host reference deployment. The web process and worker must therefore share one filesystem and one database. Deploy exactly one service with one replica and one persistent volume. Do not split web and worker into separate Railway services or scale replicas until the repository and queue are migrated to PostgreSQL.

## 1. Create the service and volume

1. In Railway, create a project from the `mherzog4/callcraft` GitHub repository.
2. Keep the repository root as the service root. Railway reads `railway.json` automatically.
3. Add a Railway volume to the service and mount it at `/data` **before the first live workflow**.
4. Keep the service at one replica.

Railway volumes are mounted only at runtime and initially arrive root-owned. The container entrypoint fixes the `/data` mount-root ownership, drops to UID/GID 1000, and invokes `npm run start:container`. The runtime then applies Drizzle migrations and starts both processes with signal forwarding and fail-together behavior.

## 2. Configure variables

Set these in the Railway service. Never upload or commit a local `.env` file.

```dotenv
APP_MODE=evaluation
APP_URL=https://callcraft.mattherzog.xyz
DATABASE_PATH=/data/app.db
EVAL_REPORT_DIRECTORY=/data/evals
MASTER_KEY=<at-least-32-random-characters>
SESSION_SECRET=<at-least-32-random-characters>
OPENROUTER_API_KEY=<secret>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-small
SLACK_CLIENT_ID=<value>
SLACK_CLIENT_SECRET=<secret>
SLACK_SIGNING_SECRET=<secret>
GOOGLE_CLIENT_ID=<value>
GOOGLE_CLIENT_SECRET=<secret>
TRANSCRIPT_RETENTION_DAYS=7
LOG_LEVEL=info
```

Do not set `DEMO_MODE`, `GONG_ACCESS_KEY`, or `GONG_ACCESS_SECRET` for the evaluation demo. Railway injects `PORT`; do not hard-code it.

Generate secrets locally without printing them, for example:

```bash
openssl rand -base64 48
```

## 3. Deploy and verify

The first deployment builds the production image and starts with:

```bash
npm run start:container
```

Check the Railway deployment logs for:

```text
Database migrations applied
==> Starting web and worker on port ...
```

Then verify Railway's generated domain:

```bash
curl https://YOUR-SERVICE.up.railway.app/api/health
```

Expected response:

```json
{ "status": "ok", "deadLetters": 0 }
```

The configured Railway health check gates traffic during deployment. Add external uptime monitoring if continuous health monitoring is required.

## 4. Attach the custom domain

1. In the Railway service, open **Settings → Networking → Custom Domain**.
2. Add `callcraft.mattherzog.xyz`.
3. In Cloudflare DNS, create the CNAME and verification TXT records Railway displays.
4. Use **DNS only** while Railway verifies the domain and provisions TLS.
5. Remove any Cloudflare Tunnel public-hostname route using the same hostname so it cannot conflict with Railway DNS.

After verification:

```bash
curl https://callcraft.mattherzog.xyz/api/health
```

Keep these provider URLs exact:

```text
Slack OAuth:        https://callcraft.mattherzog.xyz/api/slack/oauth/callback
Slack interactions: https://callcraft.mattherzog.xyz/api/slack/interactions
Google OAuth:       https://callcraft.mattherzog.xyz/api/google/oauth/callback
```

## 5. Acceptance and operations

Connect Slack first, save the OpenRouter setup, connect Gmail, click Sync, review privately in Slack, and explicitly confirm a send between evaluator-owned accounts. Then run `npm run acceptance:verify` against a downloaded database backup or through a Railway shell with the service variables and volume mounted.

Before the public demo:

- rotate every provider secret that has been shared outside the provider console;
- verify a redeploy preserves `/data/app.db` and `/data/evals`;
- configure volume backups and expiry aligned with transcript retention;
- inspect logs for dead-letter jobs and OAuth reconnect errors; and
- keep the service at one replica.

For horizontal scaling, migrate SQLite and durable jobs to PostgreSQL or a managed queue first.
