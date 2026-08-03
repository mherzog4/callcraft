import { enqueueJob, getSeller, upsertInstallation, upsertSeller } from "@/src/db/repositories";

export const DEMO_SELLER_ID = "demo-seller";
export const SEEDED_GONG_USER_ID = "gong-user-alex";

export function attachSeededGong(sellerId: string) {
  const seller = getSeller(sellerId);
  if (!seller) throw new Error("Cannot attach seeded Gong to a missing seller");
  return upsertInstallation({
    sellerId,
    provider: "gong",
    mode: "demo",
    externalAccountId: SEEDED_GONG_USER_ID,
    metadata: { label: "Seeded Gong — synthetic data", synthetic: true },
  });
}

export function seedDemo() {
  const seller = upsertSeller({
    id: DEMO_SELLER_ID,
    email: "alex.morgan@example.com",
    displayName: "Alex Morgan",
  });
  const gong = upsertInstallation({
    sellerId: seller.id,
    provider: "gong",
    mode: "demo",
    externalAccountId: SEEDED_GONG_USER_ID,
    metadata: { label: "Seeded Gong workspace", synthetic: true },
  });
  upsertInstallation({
    sellerId: seller.id,
    provider: "slack",
    mode: "demo",
    metadata: { channel: "local-preview" },
  });
  upsertInstallation({
    sellerId: seller.id,
    provider: "google",
    mode: "demo",
    metadata: { sender: seller.email },
  });
  upsertInstallation({
    sellerId: seller.id,
    provider: "openrouter",
    mode: "demo",
    metadata: { model: "demo-grounded-v1" },
  });
  enqueueJob("discover_calls", `discover:${gong.id}:seed`, {
    sellerId: seller.id,
    installationId: gong.id,
  });
  enqueueJob("cleanup", `cleanup:${seller.id}:seed`, { sellerId: seller.id });
  return seller;
}
