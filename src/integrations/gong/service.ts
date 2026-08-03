import { getCredential, getInstallation } from "@/src/db/repositories";
import { getEnv } from "@/src/env";
import { decryptSecret } from "@/src/security/crypto";
import type { GongUser } from "@/src/integrations/gong/contract";
import { createGongAdapter } from "@/src/integrations/gong/index";

function parseCredential(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Gong credential is not an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error("Gong credential is malformed", { cause: error });
  }
}

export async function listGongUsersForSeller(sellerId: string): Promise<GongUser[]> {
  const installation = getInstallation(sellerId, "gong");
  if (!installation) return [];
  const credential = getCredential(installation.id);
  if (!credential?.secretEncrypted) return [];
  const config = parseCredential(decryptSecret(credential.secretEncrypted, getEnv().MASTER_KEY));
  const adapter = createGongAdapter(installation.mode, {
    key: installation.id,
    ...(typeof config.baseUrl === "string" ? { baseUrl: config.baseUrl } : {}),
    ...(typeof config.accessKey === "string" ? { accessKey: config.accessKey } : {}),
    ...(typeof config.accessSecret === "string" ? { accessSecret: config.accessSecret } : {}),
  });
  return (await adapter.listUsers()).filter((user) => user.active);
}
