---
status: accepted
---

# Use SQLite for a single-host durable job queue

CallCraft uses SQLite through Drizzle for application state and durable job coordination so an OSS deployment can run locally or on one inexpensive host without operating another service. WAL mode, short transactional claims, leases, idempotency keys, and uniqueness constraints provide restart safety within that boundary; multi-host or serverless deployments must replace this repository and queue implementation with PostgreSQL or a managed queue.

## Considered options

An in-memory queue would be simpler but would lose automatic call processing across restarts. PostgreSQL or a hosted queue would scale farther but would make the initial self-hosted experience materially heavier.
