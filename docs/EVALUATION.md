# End-to-end evaluation without a Gong account

This runbook tests CallCraft locally with:

- **Seeded Gong** calls, context, participants, and transcripts (synthetic data)
- **Real OpenRouter** extraction/composition
- **Real Slack** OAuth, private review message, editing, regeneration, and confirmation
- **Real Gmail** OAuth and submission

No Gong account or Gong credentials are required. Use only Slack, Google, sender, and recipient accounts you control.

> [!CAUTION]
> The fixture recipient is in the reserved `.example.org` domain. CallCraft blocks Send while a reserved example-domain recipient remains. Use **Edit** in Slack and replace To/Cc with an evaluator-owned address before confirming.

## 1. Install prerequisites

Install Node.js 20.11+ and npm 10+, then install `cloudflared`:

```bash
# macOS
brew install cloudflared

# Other platforms: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

Install project dependencies:

```bash
npm install
cp .env.example .env
```

## 2. Start a temporary HTTPS tunnel

In terminal 1:

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the generated `https://<random-words>.trycloudflare.com` hostname. Keep this process running.

A Quick Tunnel hostname is temporary. If it changes, you must:

1. update `APP_URL` in `.env`;
2. update the Slack OAuth redirect and interactivity URLs;
3. update the Google authorized redirect URI; and
4. restart both the CallCraft web and worker processes.

OAuth redirect URIs are exact string matches. A stale hostname will cause OAuth or Slack interactions to fail.

## 3. Generate local secrets and configure `.env`

Generate separate strong values:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Configure `.env` using the current tunnel URL:

```dotenv
APP_MODE=evaluation
APP_URL=https://YOUR-CURRENT-HOST.trycloudflare.com
DATABASE_PATH=./data/evaluation.db
MASTER_KEY=PASTE_FIRST_RANDOM_VALUE
SESSION_SECRET=PASTE_SECOND_RANDOM_VALUE
OPENROUTER_MODEL=openai/gpt-4.1-mini
OPENROUTER_API_KEY=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TRANSCRIPT_RETENTION_DAYS=7
LOG_LEVEL=info
```

Do not combine `APP_MODE` with the deprecated `DEMO_MODE` variable. Keep the same `MASTER_KEY` while credentials are connected; changing it makes stored credentials undecryptable and requires reconnecting providers.

## 4. Create an OpenRouter API key

1. Sign in at <https://openrouter.ai/>.
2. Create an API key with a small spending limit suitable for testing.
3. Choose a model that reliably supports JSON output. The default is `openai/gpt-4.1-mini`.
4. Save the key later in CallCraft Settings. It is encrypted in SQLite; leaving `OPENROUTER_API_KEY` blank avoids keeping the key in `.env`.

Real OpenRouter failures are surfaced as failed/retrying jobs. CallCraft never substitutes deterministic demo output after a real-provider failure.

## 5. Create and configure the Slack app

1. Open <https://api.slack.com/apps> and choose **Create New App → From an app manifest**.
2. Copy [`slack-manifest.yaml`](./slack-manifest.yaml), replacing `YOUR_HOST` with the current Quick Tunnel hostname (without an extra scheme in the placeholder).
3. Confirm these exact endpoints:
   - OAuth redirect: `https://YOUR-CURRENT-HOST.trycloudflare.com/api/slack/oauth/callback`
   - Interactivity URL: `https://YOUR-CURRENT-HOST.trycloudflare.com/api/slack/interactions`
4. Under **Basic Information**, copy the Client ID, Client Secret, and Signing Secret into `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_SIGNING_SECRET` in `.env`.
5. Keep the bot scopes from the manifest: `chat:write`, `im:write`, `users:read`, and `users:read.email`.
6. Ensure interactivity and the App Home Messages tab are enabled.

You do not need to distribute the app publicly for a test in your own workspace.

## 6. Create and configure Google OAuth

1. Create or select a project in <https://console.cloud.google.com/>.
2. Enable the **Gmail API**.
3. Configure the Google Auth Platform/OAuth consent screen:
   - choose **External** unless your Workspace organization supports Internal;
   - keep publishing status **Testing**;
   - add your Google/Gmail account as a test user; and
   - include the identity scopes plus `https://www.googleapis.com/auth/gmail.send`.
4. Create an OAuth client of type **Web application**.
5. Add this exact authorized redirect URI:
   - `https://YOUR-CURRENT-HOST.trycloudflare.com/api/google/oauth/callback`
6. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

Testing mode avoids public verification for explicitly listed test users. Google may show an unverified-app warning. CallCraft requests only identity and Gmail send access; the message appears in the connected account's Sent folder.

## 7. Start CallCraft

After all callback URLs and `.env` values use the same tunnel hostname:

```bash
npm run db:migrate
```

Build once, then start the web process in terminal 2:

```bash
npm run build
npm start
```

Using the production server makes secure OAuth session cookies and tunnel behavior match the intended deployment. Rebuild after changing application code. In terminal 3, start the durable worker:

```bash
npm run worker -- --watch
```

Open the **HTTPS Quick Tunnel URL**, not `http://localhost:3000`. The worker and web process use the same `DATABASE_PATH` and encryption key from `.env`.

## 8. Connect providers in order

1. Click **Connect Slack**. Slack OAuth creates and signs in the seller and attaches a seeded Gong installation to that seller.
2. In Settings, verify **Gong (synthetic)** and real Slack are connected.
3. Paste the OpenRouter API key, confirm the model, and choose **Save encrypted setup**.
4. Click **Connect Gmail** and authorize the evaluator-owned Google account.
5. Verify Settings shows real OpenRouter, Slack, and Gmail connected.
6. Go to the dashboard and click **Sync & process now**.

The worker discovers the fixtures only after Slack and OpenRouter setup are ready, then calls real OpenRouter and sends the grounded draft to your private Slack conversation.

## 9. Perform the acceptance test

1. In Slack, confirm the message says **SYNTHETIC** and has no usable **Open in Gong** action.
2. Open **View context** and inspect the transcript evidence.
3. Try **Regenerate** and verify the existing Slack message is updated rather than duplicated.
4. Choose **Edit** and replace every `.example.com`, `.example.net`, or `.example.org` To/Cc address with an address you own. Save the new revision.
5. Choose **Send email** and inspect the exact From, To, Cc, subject, and complete body.
6. Before confirmation, verify no email exists in Gmail Sent.
7. Confirm once. Wait for the worker and verify:
   - the message appears once in Gmail Sent;
   - the recipient account receives it;
   - Slack changes to **Submitted via Gmail**; and
   - CallCraft does not claim delivery or read status.
8. Repeat the confirmation action if possible and verify no second message is submitted.

If the worker loses the network after Gmail may have accepted a submission, CallCraft marks the outcome **unknown** and will not retry automatically. Reconcile that state manually in Gmail.

## 10. Reset or reconnect

**Reset synthetic calls** removes seeded calls, transcripts, summaries, drafts, send intents, deliveries, jobs, and seeded sync cursors. It does not remove the seller or disconnect Slack, Gmail, or OpenRouter.

Use Gmail disconnect/reconnect when testing token revocation. Stop the web, worker, and tunnel when finished. Delete `data/evaluation.db` if you want to remove all locally stored OAuth credentials and workflow data.
