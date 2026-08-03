# ADR-0006: Use an explicit evaluation provider policy

- Status: Accepted
- Date: 2026-08-03

## Context

The all-local seeded demo intentionally disabled every real provider, while production required real Gong credentials. Evaluators without Gong could not exercise the real OpenRouter, Slack, and Gmail path. Allowing arbitrary per-provider mixtures would make it easy to mistake synthetic output for production data or silently fall back after a provider failure.

## Decision

CallCraft has three centrally enforced application modes:

- `demo`: seeded Gong, deterministic generation, Slack preview, and email preview;
- `evaluation`: seeded Gong plus real OpenRouter, Slack, and Gmail; and
- `production`: real Gong, OpenRouter, Slack, and Gmail.

Installation creation, startup validation, and adapter creation reject any other combination. Evaluation data is labeled synthetic in the dashboard and Slack. Reserved example-domain fixture recipients must be replaced before real Gmail confirmation. Evaluation reset removes synthetic workflow data but preserves real OAuth installations.

## Consequences

A user without Gong can run the meaningful downstream workflow against accounts they own. The provider matrix remains small, auditable, and resistant to accidental fallback. Supporting another mixed configuration requires an explicit policy change rather than an environment-variable accident. Evaluation still requires a single persistent web/worker host, a public HTTPS callback URL, and real provider credentials for OpenRouter, Slack, and Google.
