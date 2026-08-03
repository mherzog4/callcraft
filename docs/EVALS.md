# Applied AI evaluation harness

CallCraft is a reference implementation and live technical demo, not a claim that the Gong connector has been verified against a customer tenant. The eval layer measures the parts that can be tested faithfully without Gong: transcript normalization, grounded extraction, deterministic draft rendering, recipient safety, model reliability, and OpenRouter cost/latency trade-offs.

## Dataset

The versioned scenarios in `src/evals/scenarios.ts` currently cover:

- clear commitments and quantified pain;
- ambiguous timing where dates must not be invented;
- prompt injection embedded in transcript content;
- multiple external recipients and explicit To/Cc ownership;
- grounded prices, dates, times, and seller counts; and
- unresolved objections that must not be presented as approvals.

Every scenario contains synthetic transcript segments, participants, optional Gong-shaped context, expected concepts, forbidden unsupported terms, expected recipients, required evidence segment IDs, and a golden grounded result. Add scenarios instead of weakening thresholds when a regression reveals a new failure mode.

## Deterministic baseline

```bash
npm run eval
```

This command performs no network calls. It scores the checked-in golden candidates, validates the metrics/report pipeline, writes timestamped JSON under `data/evals/`, and updates `data/evals/latest.json`. CI runs this baseline. A checked-in sample report allows the dashboard to render immediately after cloning.

Primary metrics are deterministic:

- schema validity;
- exact evidence-claim coverage and citation validity;
- lexical support between each claim and its cited transcript text (a deterministic smoke check, not semantic entailment);
- required-evidence recall;
- expected-concept recall using scenario-owned term alternatives;
- exact To/Cc recipient accuracy;
- forbidden unsupported-content detection; and
- deterministic draft recipient/literal grounding.

The overall score is an average of the grounding metrics, but a scenario cannot pass with invalid citations, failed lexical/high-risk-literal claim support, forbidden content, or failed draft grounding. There is deliberately no LLM judge in the required pass/fail path. A future judge may score tone or usefulness, but it must remain secondary and separately reported.

## Live OpenRouter model comparison

Put a limited OpenRouter key in `.env`, then run:

```bash
npm run eval:live -- --models \
  openai/gpt-4.1-mini \
  anthropic/claude-sonnet-4 \
  google/gemini-2.5-flash
```

Use `--scenarios scenario-id another-id` for a smaller/cheaper run and `--no-fail` when exploration should write a report without returning a nonzero status. `EVAL_MODELS` supplies the default model list.

The runner executes extraction and composition sequentially to avoid creating an accidental burst across providers. Reports include:

- per-scenario status and metric failures;
- extraction/composition latency;
- prompt, completion, and total tokens;
- OpenRouter-reported cost when available;
- schema repair attempts;
- resolved provider name when returned; and
- OpenRouter generation IDs for later provider/cost reconciliation.

No API key, transcript, or OAuth token is written to the report. The included dataset is synthetic, but `data/evals/` remains gitignored because future local scenarios may contain sensitive material.

## Dashboard

After authentication, open `/evals`. The page reads `data/evals/latest.json`, falling back to `evals/sample-report.json`. It ranks models and exposes scenario-level failures instead of presenting one opaque score.

## Optional sqlite-vec retrieval experiment

Vector retrieval is not part of the default email pipeline. It is an experiment that asks whether embedding retrieval preserves required evidence while reducing context:

```bash
npm run eval:retrieval -- --model openai/text-embedding-3-small --top-k 3
```

The command calls [OpenRouter's embeddings endpoint](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings), loads the bundled [`sqlite-vec`](https://github.com/asg017/sqlite-vec) extension into an isolated evaluation database, embeds transcript segments and scenario retrieval queries, and writes `data/evals/retrieval-latest.json`. The dashboard displays the latest aggregate when present.

Compare required-evidence recall against context reduction before deciding to use retrieval. For ordinary single-call transcripts, the full normalized transcript remains the safer baseline. Retrieval becomes relevant only for transcripts that exceed context budgets or for explicitly designed cross-call memory.

`sqlite-vec` is pre-1.0 and platform-specific. The experiment is isolated so an extension or embedding-model change cannot affect the durable workflow.

## Adding a model or scenario

1. Add or update a scenario and golden candidate.
2. Run `npm run eval` and unit tests.
3. Run selected live models with a limited key/budget.
4. Inspect failures on `/evals`; do not compare only prose aesthetics.
5. Commit scenario changes and the sample report only when the dataset version changes intentionally.
