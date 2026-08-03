import { getCredential, getInstallation } from "@/src/db/repositories";
import { getEnv } from "@/src/env";
import { decryptSecret } from "@/src/security/crypto";
import { createGongAdapter } from "./index";
import type { GongUser } from "./contract";

export async function listGongUsersForSeller(sellerId: string): Promise<GongUser[]> {
  const installation = getInstallation(sellerId, "gong");
  if (!installation) return [];
  const credential = getCredential(installation.id);
  if (!credential?.secretEncrypted) return [];
  const config = JSON.parse(
    decryptSecret(credential.secretEncrypted, getEnv().MASTER_KEY),
  ) as Record<string, unknown>;
  const adapter = createGongAdapter(installation.mode, {
    key: installation.id,
    ...(typeof config.baseUrl === "string" ? { baseUrl: config.baseUrl } : {}),
    ...(typeof config.accessKey === "string" ? { accessKey: config.accessKey } : {}),
    ...(typeof config.accessSecret === "string" ? { accessSecret: config.accessSecret } : {}),
  });
  return (await adapter.listUsers()).filter((user) => user.active);
}
