import { test } from "@playwright/test";

// Regenerates the README imagery from the seeded demo, so the screenshots can
// never drift into showing real recipients or transcripts. Skipped by default
// because CI has no reason to spend browser time producing documentation.
// Run with: CAPTURE=1 npx playwright test capture-screenshots
test.skip(!process.env.CAPTURE, "set CAPTURE=1 to regenerate documentation screenshots");

test.use({ viewport: { width: 1280, height: 900 } });

test("capture the call review screen", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("heading", { name: /Follow up while/ }).waitFor();
  const readyCall = page.locator(".row").filter({ hasText: "Acme <> Northstar" });
  await readyCall.getByRole("link", { name: "View" }).click();
  await page.getByRole("heading", { name: "Current email draft" }).waitFor();
  await page.screenshot({ path: "docs/images/call-review.png", fullPage: true });
});

test("capture the evaluation dashboard", async ({ page }) => {
  await page.goto("/evals");
  await page.getByRole("heading", { name: "Model comparison" }).waitFor();
  await page.screenshot({ path: "docs/images/evals.png", fullPage: true });
});
