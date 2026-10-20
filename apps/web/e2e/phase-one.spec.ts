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
  await expect(page.getByRole("heading", { name: "Practice what you need." })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Course library", level: 1 })).toBeVisible();

  // Legacy group URLs land on their global equivalents.
  // Each redirect is a client-side history change; WebKit treats one still settling as interrupting the next goto, so wait for
  // the destination page itself before navigating again.
  await page.goto("/groups/legacy-library/words");
  await expect(page).toHaveURL(/\/words$/);
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  await page.goto("/groups/legacy-library");
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole("heading", { name: "Journal", level: 1 })).toBeAttached();

  // The left rail: primary destinations in order, with the course list nested under Courses.
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await page.goto("/courses");
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("banner")).toBeHidden();
  await expect(navigation.getByRole("link", { name: "Courses", exact: true })).toHaveAttribute("aria-current", "page");
  for (const name of ["Words", "Journal", "Tutor"]) await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Notices", exact: true })).toHaveCount(0);
  const railBox = await navigation.boundingBox();
  expect(railBox).not.toBeNull();
  expect(railBox!.x).toBeLessThan(40);

  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "Open notices" })).toHaveAttribute("href", "/notifications");
  await page.goto("/courses");

  // Narrow windows hide the rail behind the header's menu button.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(navigation).toBeHidden();
  await expect(page.getByRole("banner").getByRole("button", { name: "Open navigation" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Course library", level: 1 })).toBeVisible();
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
  expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
  expect(await heading.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Inter Variable");
});
