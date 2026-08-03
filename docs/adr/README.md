# Architecture decision records

| ADR                                                              | Decision                                               | Status   |
| ---------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| [0001](./0001-provider-adapters-and-seeded-demo.md)              | Use provider adapters and an explicit seeded demo mode | Accepted |
| [0002](./0002-sqlite-single-host-job-queue.md)                   | Use SQLite for a single-host durable job queue         | Accepted |
| [0003](./0003-evidence-backed-deterministic-email-generation.md) | Generate email drafts from evidence-backed claims      | Accepted |
| [0004](./0004-slack-review-and-explicit-gmail-send.md)           | Review in Slack and send explicitly through Gmail      | Accepted |
| [0005](./0005-separate-static-marketing-deployment.md)           | Deploy the static marketing site separately            | Accepted |
| [0006](./0006-explicit-evaluation-provider-policy.md)            | Enforce an explicit evaluation provider policy         | Accepted |

ADRs use sequential four-digit numbers. Do not rewrite an accepted decision after the architecture changes; add a new ADR and mark the old record as superseded.
