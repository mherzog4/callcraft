# ADR-0008: Deploy the SQLite demo as one Railway service

- Status: Accepted
- Date: 2026-08-05

## Context

The operational demo needs a public HTTPS origin for Slack OAuth and interactions, Google OAuth, a continuously running web process, and a durable worker. A laptop tunnel is suitable for temporary evaluation but is not always available. CallCraft's current persistence and queue boundary is one SQLite database on one filesystem. Independent Railway services cannot share that filesystem boundary safely, and horizontally scaled replicas would create unsupported coordination and storage behavior.

## Decision

The hosted evaluation demo uses one Railway service, one replica, and one persistent volume mounted at `/data`. A container runtime entrypoint applies migrations after the runtime volume is mounted, starts the standalone Next.js server and worker together, forwards shutdown signals, and terminates the peer process if either exits. Railway gates deployments on `/api/health` and restarts failures.

The custom domain points directly to Railway. Cloudflare remains the DNS provider but a Cloudflare Tunnel is not part of the hosted topology. The static Vercel marketing deployment remains separate.

## Consequences

Slack and Google receive a stable public callback origin without depending on a developer laptop. SQLite workflow state and eval reports survive redeploys. Web and worker share failure and scaling boundaries, so a worker failure restarts the service and a web deployment briefly replaces both processes. The service must remain at one replica. Horizontal scaling or separate web and worker services require PostgreSQL or another shared database plus a distributed queue first.
