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
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
    await expect(page.getByRole("dialog", { name: "Application navigation" })).toBeVisible();
  }
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
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("history flow: saved to localStorage, survives reload, overlay opens without new search", async ({ page }) => {
  let investigateCalls = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/investigate") && r.method() === "POST") investigateCalls++;
  });
  await page.goto("/");
  await page.getByLabel("Claim to investigate").fill("Water boils at 100°C at sea level.");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(page.getByText(/TRUE|FALSE|MIXED|MOSTLY|UNVERIFIED/i).first()).toBeVisible({ timeout: 30_000 });
  expect(investigateCalls).toBeGreaterThanOrEqual(1);
  const stored = await page.evaluate(() => localStorage.getItem("verity.history.v1"));
  expect(stored).not.toBeNull();
  expect(JSON.parse(stored!)[0].originalClaim).toMatch(/Water boils/);
  const before = investigateCalls;
  await page.reload();
  const historyList = page.getByRole("list", { name: "Recent investigations" });
  const recordButton = historyList.getByRole("button", { name: /^Water boils/ });
  await expect(recordButton).toBeVisible({ timeout: 10_000 });
  // Open the historical record: overlay appears, no new investigation fires.
  await recordButton.click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("dialog").getByText(/TRUE|FALSE|MIXED|MOSTLY|UNVERIFIED/i).first()).toBeVisible();
  expect(investigateCalls).toBe(before);
  // Escape closes, underlying state intact.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("theme flow: switch persists across reload", async ({ page }) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  const toggle = page.getByRole("button", { name: /Switch to (light|dark) mode/ });
  await toggle.click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(["light", "dark"]).toContain(after);
  await page.reload();
  await expect.poll(async () => page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
});

test("source stack: strongest source first, ordered ranks", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Claim to investigate").fill("The Great Wall of China is visible from space.");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(page.getByText(/TRUE|FALSE|MIXED|MOSTLY|UNVERIFIED/i).first()).toBeVisible({ timeout: 30_000 });
  const stack = page.getByRole("list", { name: /strongest first/ }).first();
  await expect(stack).toBeVisible();
  const items = stack.getByRole("listitem");
  expect(await items.count()).toBeGreaterThan(0);
  await expect(items.first().getByText("#1")).toBeVisible();
  await expect(items.first().getByText(/strongest evidence/)).toBeVisible();
});
