import { getEnv } from "@/src/env";
import { ensureSetup } from "@/src/jobs/setup";
import { getInstallation, getSeller, listInstallations, listJobs } from "@/src/db/repositories";
import { currentSellerId } from "@/src/web/auth";
import { preferencesSchema } from "@/src/domain/schemas";
import { listGongUsersForSeller } from "@/src/integrations/gong/service";
import { allowsRealOAuth, isDemoMode, isEvaluationMode } from "@/src/runtime/policy";

export const dynamic = "force-dynamic";

function parseMetadata(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export default async function SettingsPage() {
  ensureSetup();
  const sellerId = await currentSellerId();
  const seller = getSeller(sellerId)!;
  const installs = listInstallations(seller.id);
  const jobs = listJobs(50, seller.id);
  const env = getEnv();
  const appMode = env.APP_MODE;
  const preferences = preferencesSchema.parse(parseMetadata(seller.preferencesJson));
  const openrouter = getInstallation(seller.id, "openrouter");
  const openrouterModel = openrouter
    ? ((parseMetadata(openrouter.metadataJson) as { model?: string }).model ?? env.OPENROUTER_MODEL)
    : env.OPENROUTER_MODEL;
  let gongUsers: Awaited<ReturnType<typeof listGongUsersForSeller>> = [];
  let gongUsersError = "";
  if (appMode === "production" && getInstallation(seller.id, "gong")) {
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
          {isDemoMode(appMode)
            ? "Demo mode is credential-free and fully local."
            : isEvaluationMode(appMode)
              ? "Evaluation mode uses synthetic Gong data with real OpenRouter, Slack, and Gmail."
              : "Production mode keeps real provider credentials server-side and encrypted at rest."}
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
            {isEvaluationMode(appMode) && (
              <>
                <hr />
                <h3>Seeded Gong — synthetic data</h3>
                <p className="muted">
                  No Gong account is required. Calls, participants, context, and transcripts are
                  synthetic fixtures and are labeled throughout the review flow.
                </p>
              </>
            )}
            {appMode === "production" && (
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
              </>
            )}
            {!isDemoMode(appMode) && (
              <>
                {isEvaluationMode(appMode) && <hr />}
                <h3>OpenRouter</h3>
                <label>
                  API key {openrouter ? "(leave blank to keep the saved key)" : "(required)"}
                  <input name="openrouterApiKey" type="password" autoComplete="new-password" />
                </label>
                <label>
                  Model
                  <input name="openrouterModel" defaultValue={openrouterModel} required />
                </label>
              </>
            )}
            <button>{isDemoMode(appMode) ? "Save preferences" : "Save encrypted setup"}</button>
          </form>
        </div>
        <div className="card">
          <h2>Integration health</h2>
          {installs.map((i) => {
            const metadata = parseMetadata(i.metadataJson) as {
              reconnectRequired?: boolean;
              synthetic?: boolean;
            };
            return (
              <div className="row" key={i.id}>
                <span>
                  {i.provider === "gong" && metadata.synthetic ? "Gong (synthetic)" : i.provider}
                </span>
                <span className="status">
                  <span className="dot" />
                  {i.mode} · {metadata.reconnectRequired ? "reconnect required" : i.status}
                </span>
              </div>
            );
          })}
          <div className="actions">
            {allowsRealOAuth(appMode) && (
              <>
                <form action="/api/slack/oauth/start" method="get">
                  <button className="secondary">Connect Slack</button>
                </form>
                <form action="/api/google/oauth/start" method="get">
                  <button className="secondary">Connect Gmail</button>
                </form>
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
          {(isDemoMode(appMode) || isEvaluationMode(appMode)) && (
            <form action="/api/demo/reset" method="post">
              <button className="danger">
                {isEvaluationMode(appMode) ? "Reset synthetic calls" : "Reset seeded demo"}
              </button>
              {isEvaluationMode(appMode) && (
                <p className="muted">Slack and Gmail connections will remain connected.</p>
              )}
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
