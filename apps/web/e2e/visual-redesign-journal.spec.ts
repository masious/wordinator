import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_PASSWORD } from "./global-setup";

test("the redesigned journal preserves order and collapses cleanly on narrow screens", async ({ page }, testInfo) => {
  const suffix = `batch5-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  const older = `${suffix} first journal entry`;
  const newer = `${suffix} ${"langwoord".repeat(70)}`;

  await page.goto("/");
  await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Write something…" })).toBeVisible();

  for (const body of [older, newer]) {
    await page.getByRole("button", { name: "Write something…" }).click();
    await page.getByLabel("Sentence").fill(body);
    await page.getByRole("button", { name: "Publish post" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }

  const olderCard = page.locator("article").filter({ hasText: older });
  const newerCard = page.locator("article").filter({ hasText: `${suffix} langwoordlangwoord` });
  await expect(newerCard).toBeVisible();
  await expect(olderCard).toBeVisible();
  const [newerBox, olderBox] = await Promise.all([newerCard.boundingBox(), olderCard.boundingBox()]);
  expect(newerBox?.y).toBeLessThan(olderBox?.y ?? 0);
  if (process.env.CAPTURE_JOURNAL_REVIEW) await page.screenshot({ path: "/tmp/wordinator-journal-wide.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 700 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Write something…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(390);
  await expect.poll(async () => (await dialog.boundingBox())?.height).toBe(700);
  if (process.env.CAPTURE_JOURNAL_REVIEW) await page.screenshot({ path: "/tmp/wordinator-journal-mobile-composer.png", fullPage: true });
});
