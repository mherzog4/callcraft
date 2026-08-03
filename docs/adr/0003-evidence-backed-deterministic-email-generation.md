---
status: accepted
---

# Generate email drafts from evidence-backed claims

CallCraft separates transcript extraction from email composition: OpenRouter first returns a typed summary whose material claims cite valid transcript segments, then composition selects exact supported claims and application code renders the email. This deliberately rejects free-form model prose so transcript prompt injection and plausible-sounding fabricated dates, prices, commitments, links, or recipients cannot pass merely because the output matches a JSON shape.

## Consequences

Generated copy is less stylistically flexible than unrestricted prose, but every generated factual statement has a deterministic path back to call evidence. Seller-authored edits remain possible and are recorded as new immutable draft revisions.
