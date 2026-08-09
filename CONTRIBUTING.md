# Contributing

1. Open an issue describing the behavior and privacy impact.
2. Fork, create a focused branch, and use synthetic data only.
3. Run `npm run check`, then `npx playwright install chromium && npm run test:e2e`.
4. Add tests for adapter contract, recovery, and security behavior as applicable.
5. Submit a pull request with migration and deployment notes.

Provider calls are mocked in CI. Do not add required real-provider tests or expose captured customer payloads. New destinations and senders should implement the existing adapter interfaces. Schema changes require a Drizzle migration and migration test.

Applied AI behavior changes should add or update a synthetic scenario in `src/evals/scenarios.ts`, preserve the deterministic `npm run eval` baseline, and document intentional dataset-version changes. Live OpenRouter and embedding runs are optional, budgeted, and must never be required by CI. Do not weaken citation, recipient, forbidden-content, or draft-grounding gates to make a model pass.

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree that your contribution is licensed under MIT.
