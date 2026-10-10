import { expect, test } from "@playwright/test";
import { E2E_INVITATION_TOKEN } from "./global-setup";
import { registerLearner, signOut, uniqueTag } from "./auth";

test("a new person signs up, sets up a username, and lands in the one global library", async ({ page }, testInfo) => {
  const suffix = uniqueTag(testInfo);
  const email = `${suffix}-signup@e2e.test`;
  const username = `learner_${suffix}`;

  // Retired invitation links fall through to the ordinary signed-out entry.
  await page.goto(`/invite/${E2E_INVITATION_TOKEN}`);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Practise what you need." })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("member-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Set up your account." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a profile photo" })).toBeVisible();
  // The library stays closed until setup completes.
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "Set up your account." })).toBeVisible();
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page.getByRole("button", { name: "Open the lesson library" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();

  // Legacy group URLs land on their global equivalents.
  // Each redirect is a client-side history change; WebKit treats one still settling as interrupting the next goto, so wait for
  // the destination page itself before navigating again.
  await page.goto("/groups/legacy-library/words");
  await expect(page).toHaveURL(/\/words$/);
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  await page.goto("/groups/legacy-library");
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeAttached();

  const desktopNavigation = page.getByRole("navigation", { name: "Main navigation" });
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await page.goto("/courses");
  await expect(desktopNavigation).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  await expect(desktopNavigation.getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");
  await expect(desktopNavigation.getByRole("link")).toHaveText(["Courses", "Words", "Journal", "Notices"]);
  const islandBox = await page.getByRole("banner").locator(":scope > div").boundingBox();
  const desktopViewport = page.viewportSize();
  expect(islandBox).not.toBeNull();
  expect(desktopViewport).not.toBeNull();
  expect(islandBox!.x).toBeGreaterThan(0);
  expect(islandBox!.y).toBeGreaterThan(0);
  expect(islandBox!.width).toBeLessThan(desktopViewport!.width);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(desktopNavigation).toBeHidden();
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");
  await expect(mobileNavigation.getByRole("link")).toHaveText(["Courses", "Words", "Journal", "Notices"]);
  const dockBox = await mobileNavigation.boundingBox();
  expect(dockBox).not.toBeNull();
  expect(dockBox!.x).toBeGreaterThan(0);
  expect(dockBox!.width).toBeLessThan(390);
  expect(dockBox!.y + dockBox!.height).toBeLessThan(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 720 });
  await signOut(page);

  // A second account cannot claim the same username in a different case.
  await page.getByLabel("Email").fill(`${suffix}-second@e2e.test`);
  await page.getByRole("textbox", { name: "Password" }).fill("member-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill(username.toUpperCase());
  await page.getByRole("button", { name: "Open the lesson library" }).click();
  await expect(page.getByText("That username is already in use.")).toBeVisible();
  await page.getByRole("textbox", { name: "Username" }).fill(`${username}_2`);
  await page.getByRole("button", { name: "Open the lesson library" }).click();
  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();
});

test("signing up again with a known email is refused", async ({ page }, testInfo) => {
  const email = `${uniqueTag(testInfo)}-repeat@e2e.test`;
  await registerLearner(page, email, "member-password", `repeat_${uniqueTag(testInfo)}`);
  await signOut(page);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill("member-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("An account already uses this email. Sign in instead.")).toBeVisible();
});

test("the UI workbench remains directly addressable", async ({ page }) => {
  await page.goto("/ui");
  const heading = page.getByRole("heading", { name: "Wordinator UI workbench" });
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px "Newsreader Variable"'))).toBe(true);
  expect(await heading.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Newsreader Variable");
  expect(await page.evaluate(() => {
    const grain = getComputedStyle(document.body, "::before");
    return { pointerEvents: grain.pointerEvents, position: grain.position };
  })).toEqual({ pointerEvents: "none", position: "fixed" });
});
