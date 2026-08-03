# Single-host deployment and evaluator setup

CallCraft's operational application is a stateful web process plus a durable worker sharing one SQLite database. The Vercel project hosts only the static marketing site. Do not deploy the operational application to a serverless platform without replacing SQLite and the queue.

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
