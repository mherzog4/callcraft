import { notFound } from "next/navigation";
import { callSummarySchema, emailDraftSchema } from "@/src/domain/schemas";
import { ensureSetup } from "@/src/jobs/setup";
import {
  getCallForSeller,
  getGongContext,
  getSegments,
  latestDraft,
  latestSummary,
} from "@/src/db/repositories";
import { currentSellerId } from "@/src/web/auth";
import { getEnv } from "@/src/env";

export const dynamic = "force-dynamic";
export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  ensureSetup();
  const sellerId = await currentSellerId();
  const { id } = await params;
  const call = getCallForSeller(id, sellerId);
  if (!call) notFound();
  const context = getGongContext(id);
  const summaryRow = latestSummary(id);
  const summary = summaryRow ? callSummarySchema.parse(JSON.parse(summaryRow.summaryJson)) : null;
  const row = latestDraft(id);
  const draft = row
    ? emailDraftSchema.parse({
        to: JSON.parse(row.toJson),
        cc: JSON.parse(row.ccJson),
        subject: row.subject,
        body: row.body,
      })
    : null;
  const segments = getSegments(id);
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">{call.state.replaceAll("_", " ")}</div>
        <h1>{call.title}</h1>
        <p>
          {call.startedAt.toLocaleString()} · {Math.round(call.durationSeconds / 60)} minutes
        </p>
        <div className="actions">
          <a className="button secondary" href={call.gongUrl} target="_blank" rel="noreferrer">
            Open in Gong ↗
          </a>
          <form action="/api/generate" method="post">
            <input type="hidden" name="callId" value={call.id} />
            <button>Regenerate</button>
          </form>
        </div>
      </section>
      <section className="grid">
        <div className="card">
          <h2>Gong context</h2>
          <p>{context?.brief ?? "Gong analysis is not available."}</p>
          {context?.outcome && (
            <p>
              <strong>Outcome</strong>
              <br />
              {context.outcome}
            </p>
          )}
          <ul>
            {context?.keyPoints.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="card wide">
          <h2>Current email draft</h2>
          {draft ? (
            <>
              <p>
                <strong>To:</strong> {draft.to.join(", ")}
                <br />
                <strong>Subject:</strong> {draft.subject}
              </p>
              <div className="email">{draft.body}</div>
              <p className="muted">
                Sending is available only from the private Slack review, where the exact sender, To,
                Cc, subject, and full body are confirmed.
              </p>
              {getEnv().DEMO_MODE && (
                <form action="/api/send" method="post">
                  <input type="hidden" name="draftId" value={row!.id} />
                  <button>Simulate confirmed send (local preview only)</button>
                </form>
              )}
            </>
          ) : (
            <p>Draft generation is pending. Run the worker from the dashboard.</p>
          )}
        </div>
        <div className="card wide">
          <h2>Evidence-backed summary</h2>
          {summary ? (
            <>
              <strong>Next steps</strong>
              <ul>
                {summary.nextSteps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <strong>Evidence</strong>
              {summary.evidence.map((e) => (
                <p key={e.claim}>
                  {e.claim}
                  <br />
                  <span className="muted code">{e.segmentIds.join(", ")}</span>
                </p>
              ))}
            </>
          ) : (
            <p>Extraction pending.</p>
          )}
        </div>
        <div className="card">
          <h2>Transcript evidence</h2>
          <div className="list">
            {segments.slice(0, 8).map((s) => (
              <p key={s.id}>
                <strong>{s.speakerName}</strong>{" "}
                <span className="muted">{Math.floor(s.startMs / 1000)}s</span>
                <br />
                {s.text}
              </p>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
