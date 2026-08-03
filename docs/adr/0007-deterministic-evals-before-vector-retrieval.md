# ADR-0007: Require deterministic evals before adopting vector retrieval

- Status: Accepted
- Date: 2026-08-03

## Context

A polished follow-up email can still contain unsupported claims, wrong recipients, or invented material details. Model choice introduces quality, latency, and cost trade-offs. Vector retrieval may reduce transcript context, but it can also omit decisive evidence and add an embedding/privacy boundary. Adding retrieval before measuring the full-transcript baseline would optimize without evidence.

## Decision

CallCraft includes a versioned synthetic scenario dataset and deterministic pass/fail metrics for schema validity, citation validity, required-evidence recall, expected-concept recall, recipient accuracy, forbidden unsupported content, and draft grounding. The no-network golden baseline runs in CI. Live OpenRouter model comparison is opt-in and records latency, tokens, cost, repair attempts, provider metadata, and generation IDs.

`sqlite-vec` retrieval remains an isolated experiment. It embeds synthetic segments through an explicitly selected OpenRouter embedding model and reports evidence recall versus context reduction. It does not alter the default full-transcript workflow. An LLM judge may later score subjective qualities, but it cannot replace deterministic safety and grounding gates.

## Consequences

Model and retrieval decisions become reproducible and reviewable rather than based on anecdotal prose quality. Default CI stays deterministic and credential-free. Live evals and embeddings incur provider cost and require an explicit key. The checked-in sample report makes the dashboard cloneable, while local reports remain ignored because future datasets may contain sensitive content. `sqlite-vec` is pre-1.0 and platform-specific, but its isolation prevents it from becoming an operational dependency of the durable workflow.
