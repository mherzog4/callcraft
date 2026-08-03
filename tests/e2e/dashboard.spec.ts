import { expect, test } from "@playwright/test";
test("seeded seller can review automatic draft", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Follow up while/ })).toBeVisible();
  await expect(page.getByText("Seeded demo mode is active")).toBeVisible();
  const readyCall = page.locator(".row").filter({ hasText: "Acme <> Northstar" });
  await readyCall.getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: "Current email draft" })).toBeVisible();
  await expect(page.getByText("Gong context")).toBeVisible();
});

test("seller can inspect the deterministic evaluation report", async ({ page }) => {
  await page.goto("/evals");
  await expect(page.getByRole("heading", { name: /Grounding quality/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model comparison" })).toBeVisible();
  await expect(page.getByText("golden-reference-v1").first()).toBeVisible();
  await expect(page.getByText("100%").first()).toBeVisible();
});
