# Architecture and lifecycle

The app is a single-node Next.js web process plus a separately invokable SQLite worker. Both use the same repository layer. Adapters isolate Gong, OpenRouter, Slack, and Gmail. Demo adapters implement the same contracts and never activate as fallback from a real provider failure.

## Automatic call lifecycle

```text
discovered -> awaiting_transcript -> ready -> extracting -> drafting
  -> delivering -> delivered
       |             |            |           |
       +-- retry_wait (bounded exponential retry) --------+
                                      -> dead_letter

delivered -- Regenerate --> extracting -> drafting (new grounded summary and draft revision)
```

Call discovery uses overlapping UTC windows. `(installation_id, external_call_id)` and per-stage job idempotency keys make overlap and worker restart safe. A call with no transcript remains `awaiting_transcript`; the worker schedules exponential retries capped at six hours without consuming failure attempts or dead-lettering merely because Gong is still processing it. A later discovery pass can explicitly revive terminal fetch work. The first non-empty transcript transactionally moves the call to `ready` and enqueues extraction exactly once. Running jobs carry five-minute leases; an expired lease is reclaimed. Five-minute discovery buckets and daily cleanup buckets make recurring scheduling idempotent.

Slack delivery is automatic. Email sending is never automatic. Slack action routes acknowledge before deferred provider calls such as opening modals. **Send email** creates an immutable intent bound to a specific draft revision after a seller confirms plain-text sender, To, Cc, subject, and the complete body. States are `pending_confirmation -> confirmed -> submitting -> submitted`; a lease expiring in `submitting` moves to `unknown` without resubmitting. The MIME Message-ID and audit header are deterministic from the intent ID. `unknown` requires manual Gmail reconciliation and removes the Send action. Explicit Gmail authorization failures mark the installation as reconnect-required and report that the email was not sent; ambiguous transport outcomes remain distinct.

## Trust boundaries

Real mode requires a signed, expiring seller session. Dashboard queries and mutation routes scope calls, drafts, installations, and jobs to that seller; mutating browser requests require the exact configured Origin. Slack requests require a valid timestamped signature and the payload team/user must map to the owning seller. OAuth state binds provider callbacks to the initiating seller. In demo mode real OAuth and all real provider adapters are disabled, and reset deletes only the fixed demo tenant.

Gong transcript and analysis content are untrusted input. It is delimited, never interpolated as instructions, and structured output is schema validated. Material extracted facts include transcript segment evidence. Composition does not accept free-form model prose: the model selects exact evidence-backed summary claims, then deterministic application templates render the subject and body. Unsupported claim selections and novel high-risk literals such as dates, times, percentages, URLs, and prices are rejected. Secrets are AES-256-GCM encrypted with an application master key. Logs omit transcripts, Gong context, recipient addresses, email bodies, and tokens.

## SQLite boundary

SQLite runs with WAL, foreign keys, and a busy timeout. Job claims and state transitions are short transactions. This supports one web host and a small number of local worker processes. Multi-host/serverless deployments must move the Drizzle repository to PostgreSQL and a distributed queue; business logic does not issue SQLite SQL directly.
