import { enqueueJob, upsertInstallation, upsertSeller } from "@/src/db/repositories";

export const DEMO_SELLER_ID = "demo-seller";

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
    externalAccountId: "gong-user-alex",
    metadata: { label: "Seeded Gong workspace" },
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
