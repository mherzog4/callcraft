## Summary

<!-- What changes and why. Link the issue. -->

## Checklist

- [ ] `npm run check` passes
- [ ] `npm run test:e2e` passes (run `npx playwright install chromium` first)
- [ ] Synthetic data only — no customer transcripts, real recipients, or credentials
- [ ] Schema changes include a Drizzle migration and a migration test
- [ ] Applied AI behavior changes update `src/evals/scenarios.ts` and keep the deterministic `npm run eval` baseline
- [ ] Migration and deployment notes below, if any
