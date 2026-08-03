import { getEnv } from "@/src/env";
import { ensureSetup } from "@/src/jobs/setup";
import { getInstallation, getSeller, listInstallations, listJobs } from "@/src/db/repositories";
import { currentSellerId } from "@/src/web/auth";
import { preferencesSchema } from "@/src/domain/schemas";
import { listGongUsersForSeller } from "@/src/integrations/gong/service";

export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  ensureSetup();
  const sellerId = await currentSellerId();
  const seller = getSeller(sellerId)!;
  const installs = listInstallations(seller.id);
  const jobs = listJobs(50, seller.id);
  const env = getEnv();
  const preferences = preferencesSchema.parse(JSON.parse(seller.preferencesJson));
  const openrouter = getInstallation(seller.id, "openrouter");
  const openrouterModel = openrouter
    ? ((JSON.parse(openrouter.metadataJson) as { model?: string }).model ?? env.OPENROUTER_MODEL)
    : env.OPENROUTER_MODEL;
  let gongUsers: Awaited<ReturnType<typeof listGongUsersForSeller>> = [];
  let gongUsersError = "";
  if (!env.DEMO_MODE && getInstallation(seller.id, "gong")) {
    try {
      gongUsers = await listGongUsersForSeller(seller.id);
    } catch {
      gongUsersError = "Could not load Gong users. Verify the Gong connection and try again.";
    }
  }
  return (
    <main>
      <section className="hero">
        <div className="eyebrow">First-run setup</div>
        <h1>Connect the seller workflow.</h1>
        <p>
          Demo mode is credential-free. Real mode keeps provider credentials server-side and
          encrypted at rest.
        </p>
      </section>
      <section className="grid">
        <div className="card wide">
          <h2>Seller & writing preferences</h2>
          <form className="stack" action="/api/setup" method="post">
            <label>
              Name
              <input name="displayName" defaultValue={seller.displayName} />
            </label>
            <label>
              Email
              <input type="email" name="email" defaultValue={seller.email} />
            </label>
            <label>
              Tone
              <select name="tone" defaultValue={preferences.tone}>
                <option>warm</option>
                <option>concise</option>
                <option>consultative</option>
                <option>direct</option>
              </select>
            </label>
            <label>
              Length
              <select name="length" defaultValue={preferences.length}>
                <option>short</option>
                <option>medium</option>
                <option>long</option>
              </select>
            </label>
            <label>
              Signature
              <textarea name="signature" defaultValue={preferences.signature} />
            </label>
            <label>
              Retention policy
              <select name="retentionMode" defaultValue={preferences.retentionMode}>
                <option value="days">Delete after a number of days</option>
                <option value="after_delivery">Delete after Slack delivery</option>
              </select>
            </label>
            <label>
              Retention days
              <input
                type="number"
                min="0"
                max="365"
                name="retentionDays"
                defaultValue={preferences.retentionDays}
              />
            </label>
            {!env.DEMO_MODE && (
              <>
                <hr />
                <h3>Gong API</h3>
                <label>
                  Tenant base URL
                  <input name="gongBaseUrl" type="url" placeholder="https://api-…gong.io" />
                </label>
                <label>
                  Access key
                  <input name="gongAccessKey" autoComplete="off" />
                </label>
                <label>
                  Access secret
                  <input name="gongAccessSecret" type="password" autoComplete="new-password" />
                </label>
                <label>
                  Gong seller identity
                  {gongUsers.length ? (
                    <select name="gongUserId" defaultValue={seller.gongUserId ?? ""}>
                      <option value="" disabled>
                        Select a Gong user
                      </option>
                      {gongUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {`${user.firstName} ${user.lastName}`.trim()} · {user.email}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name="gongUserId"
                      defaultValue={seller.gongUserId ?? ""}
                      placeholder="Configure credentials, save, then select a user"
                    />
                  )}
                </label>
                {gongUsersError && <p className="error">{gongUsersError}</p>}
                <h3>OpenRouter</h3>
                <label>
                  API key
                  <input name="openrouterApiKey" type="password" autoComplete="new-password" />
                </label>
                <label>
                  Model
                  <input name="openrouterModel" defaultValue={openrouterModel} />
                </label>
              </>
            )}
            <button>{env.DEMO_MODE ? "Save preferences" : "Save encrypted setup"}</button>
          </form>
        </div>
        <div className="card">
          <h2>Integration health</h2>
          {installs.map((i) => {
            const metadata = JSON.parse(i.metadataJson) as { reconnectRequired?: boolean };
            return (
              <div className="row" key={i.id}>
                <span>{i.provider}</span>
                <span className="status">
                  <span className="dot" />
                  {i.mode} · {metadata.reconnectRequired ? "reconnect required" : i.status}
                </span>
              </div>
            );
          })}
          <div className="actions">
            {!env.DEMO_MODE && (
              <>
                <a className="button secondary" href="/api/slack/oauth/start">
                  Connect Slack
                </a>
                <a className="button secondary" href="/api/google/oauth/start">
                  Connect Gmail
                </a>
              </>
            )}
          </div>
        </div>
        <div className="card full">
          <h2>Retry visibility</h2>
          {jobs.slice(0, 12).map((j) => (
            <div className="row" key={j.id}>
              <span className="code">{j.type}</span>
              <span className="status">
                {j.status} · attempt {j.attempts}/{j.maxAttempts}
              </span>
            </div>
          ))}
          {env.DEMO_MODE && (
            <form action="/api/demo/reset" method="post">
              <button className="danger">Reset seeded demo</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
