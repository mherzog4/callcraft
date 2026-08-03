import { hasReservedExampleRecipients } from "@/src/domain/email-safety";
import { emailDraftSchema } from "@/src/domain/schemas";
import {
  getCredential,
  getDraft,
  getInstallationById,
  getSlackDelivery,
  listCalls,
  listInstallations,
  listSellers,
  listSendIntents,
} from "@/src/db/repositories";
import { getEnv } from "@/src/env";
import { ensureSetup } from "@/src/jobs/setup";

interface AcceptanceCheck {
  name: string;
  passed: boolean;
  detail: string;
}
interface AcceptanceResult {
  passed: boolean;
  checks: AcceptanceCheck[];
}

function providerDetail(
  installation: ReturnType<typeof listInstallations>[number] | undefined,
  credentialReady: boolean,
): string {
  if (!installation) return "missing";
  const credentialStatus = credentialReady ? "present" : "missing";
  return `${installation.mode} · ${installation.status} · credential ${credentialStatus}`;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is malformed`, { cause: error });
  }
}

export function verifyLiveAcceptance(): AcceptanceResult {
  ensureSetup();
  const env = getEnv();
  const sellers = listSellers();
  const checks: AcceptanceCheck[] = [
    {
      name: "evaluation mode",
      passed: env.APP_MODE === "evaluation",
      detail: `APP_MODE=${env.APP_MODE}`,
    },
    {
      name: "single evaluator seller",
      passed: sellers.length === 1,
      detail: `${sellers.length} seller record(s)`,
    },
  ];

  const seller = sellers[0];
  if (!seller) return { passed: false, checks };
  const installations = listInstallations(seller.id);
  const expected = new Map([
    ["gong", "demo"],
    ["openrouter", "real"],
    ["slack", "real"],
    ["google", "real"],
  ]);
  for (const [provider, mode] of expected) {
    const installation = installations.find((item) => item.provider === provider);
    const credential = installation ? getCredential(installation.id) : undefined;
    const credentialReady =
      provider === "gong" ||
      (provider === "openrouter" && Boolean(credential?.secretEncrypted)) ||
      (provider === "slack" && Boolean(credential?.accessTokenEncrypted)) ||
      (provider === "google" && Boolean(credential?.refreshTokenEncrypted));
    checks.push({
      name: `${provider} adapter`,
      passed: installation?.mode === mode && installation.status === "connected" && credentialReady,
      detail: providerDetail(installation, credentialReady),
    });
  }

  const calls = listCalls(seller.id, 100);
  const syntheticCalls = calls.filter(
    (call) => getInstallationById(call.installationId)?.mode === "demo",
  );
  checks.push({
    name: "synthetic transcript ingestion",
    passed: calls.length > 0 && syntheticCalls.length === calls.length,
    detail: `${syntheticCalls.length}/${calls.length} calls use seeded Gong`,
  });
  checks.push({
    name: "Slack draft delivery",
    passed: calls.some((call) => call.state === "delivered"),
    detail: `${calls.filter((call) => call.state === "delivered").length} delivered call workflow(s)`,
  });

  const intents = listSendIntents(seller.id);
  const submitted = intents.filter((intent) => intent.status === "submitted");
  checks.push({
    name: "Gmail submission",
    passed: submitted.length > 0 && submitted.every((intent) => Boolean(intent.gmailMessageId)),
    detail: `${submitted.length} submitted intent(s) with Gmail message IDs`,
  });
  checks.push({
    name: "idempotent revision binding",
    passed: new Set(intents.map((intent) => intent.draftRevisionId)).size === intents.length,
    detail: `${intents.length} intent(s), one maximum per immutable draft revision`,
  });

  let safeRecipients = true;
  let slackUpdated = submitted.length > 0;
  for (const intent of submitted) {
    const draft = getDraft(intent.draftRevisionId);
    if (!draft) {
      safeRecipients = false;
      slackUpdated = false;
      continue;
    }
    const parsed = emailDraftSchema.parse({
      to: parseJson(intent.toJson, "Send intent recipients"),
      cc: parseJson(intent.ccJson, "Send intent Cc recipients"),
      subject: intent.subjectSnapshot,
      body: intent.bodySnapshot,
    });
    if (hasReservedExampleRecipients(parsed)) safeRecipients = false;
    if (getSlackDelivery(draft.id)?.status !== "delivered") slackUpdated = false;
  }
  checks.push({
    name: "evaluator-owned recipients",
    passed: submitted.length > 0 && safeRecipients,
    detail: safeRecipients
      ? "No submitted reserved example-domain recipients"
      : "Unsafe recipient found",
  });
  checks.push({
    name: "Slack status update",
    passed: slackUpdated,
    detail: slackUpdated
      ? "Submitted revisions retain delivered Slack status"
      : "Missing Slack delivery",
  });
  return { passed: checks.every((check) => check.passed), checks };
}
