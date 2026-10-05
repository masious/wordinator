import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";

const output = resolve(import.meta.dirname, "../../../docs/visual-baselines");

test("capture pre-redesign wide and narrow references", async ({ browserName, page }) => {
  test.skip(!process.env.CAPTURE_VISUAL_BASELINES, "Run explicitly when refreshing visual references.");
  test.skip(browserName !== "chromium", "One browser is sufficient for non-asserted reference captures.");

  const capture = async (name: string, fullPage = false) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: "disabled",
      fullPage,
      path: resolve(output, name),
    });
  };

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await capture("before-auth-wide.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await capture("before-auth-narrow.png");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/ui");
  await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();
  await capture("before-ui-wide.png", true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();
  await capture("before-ui-narrow.png", true);

  await page.request.post("/api/auth/sign-in", {
    data: { email: E2E_CREATOR_EMAIL, password: E2E_PASSWORD },
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/groups/${E2E_GROUP_ID}`);
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  await capture("before-journal-wide.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  await capture("before-journal-narrow.png");
});
