---
status: accepted
---

# Review in Slack and send explicitly through Gmail

CallCraft automatically prepares a private Slack draft when Gong makes a transcript available, but never sends email automatically. Slack is the seller's review and control surface, while Gmail remains the sending system of record; a send requires an exact-revision confirmation showing sender, recipients, subject, and complete body before an idempotent Gmail submission is queued.

## Consequences

Slack and Google identities must be bound to the same seller, OAuth credentials must be encrypted and revocable, and ambiguous Gmail outcomes require manual reconciliation instead of automatic retry. This adds integration complexity but removes copy-and-paste friction without allowing an AI-generated message to send unattended.
