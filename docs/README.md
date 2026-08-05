# CallCraft documentation

- [Architecture and lifecycle](./ARCHITECTURE.md) — runtime topology, state machines, trust boundaries, and persistence constraints
- [Architecture decision records](./adr/README.md) — durable decisions and the trade-offs behind them
- [Slack app manifest](./slack-manifest.yaml) — scopes, redirect URLs, and interactive features required by the Slack integration
- [Live evaluation without Gong](./EVALUATION.md) — real OpenRouter/Slack/Gmail and the end-to-end acceptance test
- [Applied AI evals](./EVALS.md) — deterministic baseline, OpenRouter model comparison, dashboard, and optional sqlite-vec experiment
- [Railway deployment](./RAILWAY.md) — one service, one persistent volume, custom domain, and operational checks
- [Single-host deployment](./DEPLOYMENT.md) — hosted, local, and Compose topologies plus production evolution
- [Marketing site](../marketing/README.md) — static Vercel deployment and local preview instructions

## Architecture decisions

ADRs record decisions that are costly to reverse, non-obvious from the code alone, and based on meaningful trade-offs. New records go in `docs/adr/` using the next four-digit sequence number. Accepted records are immutable; a changed decision gets a new ADR that supersedes the old one.
