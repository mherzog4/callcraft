import { loadLatestEvalReport, loadLatestRetrievalReport } from "@/src/evals/report-store";
import { ensureSetup } from "@/src/jobs/setup";
import { currentSellerId } from "@/src/web/auth";

export const dynamic = "force-dynamic";

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default async function EvalsPage() {
  ensureSetup();
  await currentSellerId();
  const [{ report, source }, retrieval] = await Promise.all([
    loadLatestEvalReport(),
    loadLatestRetrievalReport(),
  ]);
  const models = [...report.models].sort(
    (left, right) => right.aggregate.overall - left.aggregate.overall,
  );
  const leader = models[0]!;
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Applied AI evaluation</div>
        <h1>Grounding quality, not just polished prose.</h1>
        <p>
          Versioned synthetic scenarios measure evidence citations, expected-concept recall,
          recipient accuracy, unsupported content, latency, tokens, and OpenRouter cost.
        </p>
        <div className="actions">
          <span className="status">Dataset {report.datasetVersion}</span>
          <span className="status">{report.mode} run</span>
          <span className="status">{new Date(report.createdAt).toLocaleString()}</span>
        </div>
      </section>
      {source === "sample" && (
        <div className="banner">
          Showing the checked-in sample report. Run <span className="code">npm run eval</span> or{" "}
          <span className="code">npm run eval:live</span> to populate the latest local report.
        </div>
      )}
      <section className="grid">
        <div className="card">
          <div className="muted">Leading model</div>
          <div className="metric model-name">{leader.modelId}</div>
        </div>
        <div className="card">
          <div className="muted">Pass rate</div>
          <div className="metric">{percent(leader.aggregate.passRate)}</div>
        </div>
        <div className="card">
          <div className="muted">Grounding</div>
          <div className="metric">{percent(leader.aggregate.citationValidity)}</div>
        </div>
        <div className="card full table-card">
          <h2>Model comparison</h2>
          <div className="table-scroll">
            <table className="eval-table">
              <caption className="sr-only">OpenRouter model evaluation comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Pass</th>
                  <th scope="col">Overall</th>
                  <th scope="col">Claim support</th>
                  <th scope="col">Concepts</th>
                  <th scope="col">Recipients</th>
                  <th scope="col">P50 latency</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.modelId}>
                    <th scope="row" className="code">
                      {model.modelId}
                    </th>
                    <td>{percent(model.aggregate.passRate)}</td>
                    <td>{percent(model.aggregate.overall)}</td>
                    <td>{percent(model.aggregate.claimSupport)}</td>
                    <td>{percent(model.aggregate.conceptRecall)}</td>
                    <td>{percent(model.aggregate.recipientAccuracy)}</td>
                    <td>{model.aggregate.p50LatencyMs.toLocaleString()} ms</td>
                    <td>{model.aggregate.totalTokens.toLocaleString()}</td>
                    <td>${model.aggregate.totalCost.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {retrieval && (
          <div className="card full">
            <h2>Optional sqlite-vec retrieval experiment</h2>
            <p className="muted">
              Embeddings are evaluated separately and do not change the default full-transcript
              generation path.
            </p>
            <div className="eval-detail-grid">
              <span>Model {retrieval.embeddingModel}</span>
              <span>Top K {retrieval.topK}</span>
              <span>Evidence recall {percent(retrieval.aggregate.evidenceRecall)}</span>
              <span>Context reduction {percent(retrieval.aggregate.contextReduction)}</span>
            </div>
          </div>
        )}
        {models.map((model) => (
          <div className="card full" key={model.modelId}>
            <h2>{model.modelId}</h2>
            <div className="list">
              {model.scenarios.map((scenario) => (
                <details className="eval-scenario" key={scenario.scenarioId}>
                  <summary>
                    <span>
                      <span
                        className={`dot ${scenario.status === "passed" ? "" : "fail"}`}
                        aria-hidden="true"
                      />{" "}
                      {scenario.title}
                    </span>
                    <span className="status">
                      {scenario.status} · {percent(scenario.metrics.overall)}
                    </span>
                  </summary>
                  <div className="eval-detail-grid">
                    <span>Citations {percent(scenario.metrics.citationValidity)}</span>
                    <span>Evidence recall {percent(scenario.metrics.evidenceRecall)}</span>
                    <span>Claim support {percent(scenario.metrics.claimSupport)}</span>
                    <span>Concept recall {percent(scenario.metrics.conceptRecall)}</span>
                    <span>Recipients {percent(scenario.metrics.recipientAccuracy)}</span>
                    <span>
                      Latency{" "}
                      {(scenario.latencyMs.extract + scenario.latencyMs.compose).toLocaleString()}{" "}
                      ms
                    </span>
                    <span>Repairs {scenario.usage.repairAttempts}</span>
                  </div>
                  {scenario.error && <p className="error">{scenario.error}</p>}
                  {scenario.failures.length > 0 && (
                    <ul>
                      {scenario.failures.map((failure) => (
                        <li key={failure}>{failure}</li>
                      ))}
                    </ul>
                  )}
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
