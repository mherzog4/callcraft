# CallCraft documentation

- [Architecture and lifecycle](./ARCHITECTURE.md) — runtime topology, state machines, trust boundaries, and persistence constraints
- [Architecture decision records](./adr/README.md) — durable decisions and the trade-offs behind them
- [Slack app manifest](./slack-manifest.yaml) — scopes, redirect URLs, and interactive features required by the Slack integration
- [Live evaluation without Gong](./EVALUATION.md) — temporary Cloudflare Tunnel, real OpenRouter/Slack/Gmail, and end-to-end acceptance test
- [Applied AI evals](./EVALS.md) — deterministic baseline, OpenRouter model comparison, dashboard, and optional sqlite-vec experiment
- [Single-host deployment](./DEPLOYMENT.md) — one-command evaluator setup, Compose topology, and production evolution
- [Marketing site](../marketing/README.md) — static Vercel deployment and local preview instructions

## Architecture decisions

ADRs record decisions that are costly to reverse, non-obvious from the code alone, and based on meaningful trade-offs. New records go in `docs/adr/` using the next four-digit sequence number. Accepted records are immutable; a changed decision gets a new ADR that supersedes the old one.
