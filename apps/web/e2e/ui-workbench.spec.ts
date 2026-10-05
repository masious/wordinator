import { expect, test } from "@playwright/test";

test("the workbench protects interaction, focus, and responsive composition", async ({ page }) => {
  await page.goto("/ui");
  await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();

  const loading = page.getByRole("button", { name: "Saving" });
  const disabled = page.getByRole("button", { name: "Unavailable" }).first();
  await expect(loading).toBeDisabled();
  await expect(disabled).toBeDisabled();

  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Adaptive dialog" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Adaptive dialog" })).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => window.matchMedia("(max-width: 48em)").matches)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Adaptive dialog" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-full-screen", "true");
  await expect.poll(async () => (await dialog.boundingBox())?.width).toBeGreaterThanOrEqual(389);
  await expect.poll(async () => (await dialog.boundingBox())?.height).toBeGreaterThanOrEqual(843);
});

test("the workbench honors reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui");
  const inventory = page.getByText("Surface depth", { exact: true });
  await inventory.scrollIntoViewIfNeeded();
  await expect(inventory).toBeVisible();
  const duration = await inventory.evaluate((node) => Number.parseFloat(getComputedStyle(node.closest("section") ?? node).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.00001);
});
