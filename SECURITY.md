# Security policy

Please report vulnerabilities privately to the repository maintainers using GitHub Security Advisories. Do not open a public issue with credentials, transcripts, email content, or exploit details.

Supported versions: the latest release on the default branch. We aim to acknowledge reports within five business days.

Never commit `.env`, SQLite data, provider tokens, Gmail previews containing real addresses, customer transcripts, or local eval reports derived from non-synthetic data. Public deployments must use TLS, strong `MASTER_KEY`/`SESSION_SECRET` values, restricted filesystem permissions, encrypted backups, and provider OAuth apps they control. Review dependency alerts and Google/Slack/Gong app permissions before deployment.
