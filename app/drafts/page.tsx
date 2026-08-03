import Link from "next/link";
import { ensureSetup } from "@/src/jobs/setup";
import { listDrafts } from "@/src/db/repositories";
import { currentSellerId } from "@/src/web/auth";

export const dynamic = "force-dynamic";
export default async function DraftsPage() {
  ensureSetup();
  const sellerId = await currentSellerId();
  const rows = listDrafts(sellerId);
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">Revision history</div>
        <h1>Every draft, traceable.</h1>
        <p>
          Generated and edited revisions are immutable. A send intent is bound to one exact
          revision.
        </p>
      </section>
      <section className="grid">
        <div className="card full">
          <div className="list">
            {rows.map(({ draft, call }) => (
              <div className="row" key={draft.id}>
                <div>
                  <strong>{draft.subject}</strong>
                  <div className="muted">
                    {call.title} · revision {draft.revision} · {draft.source}
                  </div>
                </div>
                <Link className="button secondary" href={`/calls/${call.id}`}>
                  Review
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
