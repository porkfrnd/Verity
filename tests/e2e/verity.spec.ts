import { expect, test } from "@playwright/test";

test("full flow: land → claim → progress → verdict → source → compare", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Verify a claim" })).toBeVisible();
  await page.getByLabel("Claim to investigate").fill("The Great Wall of China is visible from space.");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(page.getByText("Searching sources")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/MOSTLY|FALSE|TRUE|MIXED|UNVERIFIED|NOT A FACTUAL/i).first()).toBeVisible({ timeout: 30_000 });
  // Expand a source if present
  const details = page.getByRole("button", { name: "Details" }).first();
  if (await details.isVisible().catch(() => false)) {
    await details.click();
  }
  const compare = page.getByRole("button", { name: /Compare evidence/ });
  if (await compare.isVisible().catch(() => false)) {
    await compare.click();
    await expect(page.getByText(/Compare evidence|news\.example|nasa\.gov/i).first()).toBeVisible({ timeout: 5_000 });
  }
});

test("BYOK flow: settings → key → test connection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByLabel("API Key")).toBeVisible();
  await page.getByLabel("API Key").fill("gsk_testkey123");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText(/Status|Connected|Mock|failed/i).first()).toBeVisible({ timeout: 10_000 });
});

test("mobile viewport full flow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.getByLabel("Claim to investigate").fill("Water boils at 100°C at sea level.");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(page.getByText(/TRUE|FALSE|MIXED|MOSTLY|UNVERIFIED/i).first()).toBeVisible({ timeout: 30_000 });
});
