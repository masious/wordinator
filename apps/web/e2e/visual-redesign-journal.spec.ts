import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";

test("the redesigned journal preserves order and collapses cleanly on narrow screens", async ({ page }, testInfo) => {
  const suffix = `batch5-${uniqueTag(testInfo)}`;
  const older = `${suffix} first journal entry`;
  const newer = `${suffix} ${"langwoord".repeat(70)}`;

  await signIn(page);
  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeAttached();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Write something…" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(390);
  await expect.poll(async () => (await dialog.boundingBox())?.height).toBe(700);
  if (process.env.CAPTURE_JOURNAL_REVIEW) await page.screenshot({ path: "/tmp/wordinator-journal-mobile-composer.png", fullPage: true });
});
