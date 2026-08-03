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
