import Link from "next/link";
import { ensureSetup } from "@/src/jobs/setup";
import { getInstallationById, listCalls, listInstallations, listJobs } from "@/src/db/repositories";
import { getEnv } from "@/src/env";
import { isDemoMode, isEvaluationMode } from "@/src/runtime/policy";
import { currentSellerId } from "@/src/web/auth";

export const dynamic = "force-dynamic";
export default async function Dashboard() {
  ensureSetup();
  const sellerId = await currentSellerId();
  const calls = listCalls(sellerId);
  const jobs = listJobs(50, sellerId);
  const integrations = listInstallations(sellerId);
  const delivered = calls.filter((call) => call.state === "delivered").length;
  const appMode = getEnv().APP_MODE;
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Gong → grounded draft → Slack → Gmail</div>
        <h1>Follow up while the conversation is fresh.</h1>
        <p>
          CallCraft watches completed Gong calls, grounds a draft in transcript evidence, and brings
          it to the seller in Slack for review and explicit Gmail send.
        </p>
        <div className="actions">
          <form action="/api/jobs/run" method="post">
            <button>Sync & process now</button>
          </form>
          <Link className="button secondary" href="/settings">
            Integration settings
          </Link>
        </div>
      </section>
      {isDemoMode(appMode) && (
        <div className="banner">
          Seeded demo mode is active. Slack and email are written to{" "}
          <span className="code">data/previews/</span>; real providers are disabled.
        </div>
      )}
      {isEvaluationMode(appMode) && (
        <div className="banner">
          <strong>Evaluation mode:</strong> Gong calls and transcripts are synthetic. OpenRouter,
          Slack, and Gmail use your connected real accounts. Send only to addresses you own.
        </div>
      )}
      <section className="grid">
        <div className="card">
          <div className="muted">Recent calls</div>
          <div className="metric">{calls.length}</div>
        </div>
        <div className="card">
          <div className="muted">Drafts delivered</div>
          <div className="metric">{delivered}</div>
        </div>
        <div className="card">
          <div className="muted">Connected adapters</div>
          <div className="metric">
            {integrations.filter((item) => item.status === "connected").length}/4
          </div>
        </div>
        <div className="card wide">
          <h2>Recent calls</h2>
          <div className="list">
            {calls.length ? (
              calls.map((call) => {
                const synthetic = getInstallationById(call.installationId)?.mode === "demo";
                return (
                  <div className="row" key={call.id}>
                    <div>
                      <strong>{call.title}</strong>
                      {synthetic && <div className="status">Synthetic Gong fixture</div>}
                      <div className="muted">
                        {call.startedAt.toLocaleString()} · {Math.round(call.durationSeconds / 60)}{" "}
                        min
                      </div>
                    </div>
                    <div className="actions">
                      <span className="status">
                        <span
                          className={`dot ${call.state.includes("wait") ? "wait" : call.state === "dead_letter" ? "fail" : ""}`}
                        />
                        {call.state.replaceAll("_", " ")}
                      </span>
                      <Link className="button secondary" href={`/calls/${call.id}`}>
                        View
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <p>No calls yet. Save provider setup, then run Sync &amp; process now.</p>
            )}
          </div>
        </div>
        <div className="card">
          <h2>Worker health</h2>
          <p>{jobs.filter((job) => job.status === "dead_letter").length} dead-letter jobs</p>
          <p>{jobs.filter((job) => job.status === "retry_wait").length} waiting to retry</p>
          <Link href="/settings">View retries →</Link>
        </div>
      </section>
    </main>
  );
}
