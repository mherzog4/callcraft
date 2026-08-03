---
status: accepted
---

# Use provider adapters and an explicit seeded demo mode

CallCraft isolates Gong, OpenRouter, Slack, and email delivery behind provider-neutral contracts, with real and seeded implementations sharing the same normalized domain types. This makes the complete workflow testable without customer credentials and keeps provider-specific authentication, rate limits, and payloads out of workflow logic; real failures must remain visible and must never fall back silently to demo data.

## Consequences

Synthetic fixtures must track the external contracts closely enough to exercise pagination, delayed transcripts, retries, participant mapping, and delivery states. Adding a provider requires implementing the relevant contract and contract tests rather than branching throughout the worker.
