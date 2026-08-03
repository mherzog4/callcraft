---
status: accepted
---

# Deploy the marketing site separately from the operational application

CallCraft serves its public marketing site as a dependency-free static project from `marketing/` on Vercel, while the stateful Next.js application remains a separate self-hosted deployment. This prevents a stateless Vercel deployment from accidentally exposing application routes that require a persistent SQLite volume and long-running worker, and keeps the public surface fast, cacheable, and free of provider credentials.

## Consequences

The Vercel project must use `marketing/` as its root directory, and product UI changes do not automatically appear on the public site. A future move of the operational application to PostgreSQL and a distributed queue can justify a new ADR that combines the deployments.
