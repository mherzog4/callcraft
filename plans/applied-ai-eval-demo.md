# Applied AI evaluation demo

## Goal

Turn CallCraft into a production-shaped, cloneable reference implementation for an Applied AI interview: seeded Gong-compatible ingestion, real OpenRouter/Slack/Gmail evaluation, deterministic and live model evals, an eval dashboard, an optional sqlite-vec retrieval experiment, and repeatable single-host setup.

## Steps

- [x] Add a credential-gated live acceptance verifier for the Slack/Gmail evaluation workflow.
- [x] Add a versioned synthetic scenario dataset, deterministic scoring, and a no-network baseline eval.
- [x] Add an opt-in OpenRouter multi-model eval runner with latency, token, cost, grounding, recipient, and safety metrics.
- [x] Add a report schema, persisted JSON artifacts, sample report, and authenticated `/evals` dashboard.
- [x] Add an optional OpenRouter-embeddings + sqlite-vec retrieval experiment that reports evidence recall and context reduction without changing the default generation path.
- [x] Add evaluation setup/doctor/start commands and single-host deployment documentation.
- [x] Add tests, CI validation, security review, and final documentation positioning the project as a reference implementation rather than a verified Gong product.
- [ ] Run the real Slack/Gmail/OpenRouter acceptance test with evaluator-owned accounts (credential-gated manual step).
