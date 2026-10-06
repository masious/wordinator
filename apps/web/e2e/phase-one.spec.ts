import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_INVITATION_TOKEN, E2E_PASSWORD } from "./global-setup";

test("an invited person is approved and enters an isolated group", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.replaceAll(/[^a-z]/g, "");
  const memberName = `${testInfo.project.name} learner`;
  const memberEmail = `${suffix}@e2e.test`;
  const memberPassword = "member-password";
  const secondGroup = `${testInfo.project.name} Study Room`;

  await page.goto(`/invite/${E2E_INVITATION_TOKEN}`);
  await expect(page.getByRole("heading", { name: "Join Alpha Journal" })).toBeVisible();
  await page.getByLabel("Display name").fill(memberName);
  await page.getByLabel("Email").fill(memberEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(memberPassword);
  await page.getByRole("button", { name: "Create account and request access" }).click();
  await expect(page.getByText("Waiting for approval")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  await page.getByRole("button", { name: "Create a group" }).click();
  await page.getByLabel("Group name").fill(secondGroup);
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByRole("heading", { name: secondGroup })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByLabel("Bio").fill("Learning together, one useful phrase at a time.");
  await page.getByLabel("Quick reaction 1").fill("👏");
  await page.getByLabel("Quick reaction 2").fill("🌱");
  await page.getByLabel("Quick reaction 3").fill("🤔");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.").first()).toBeVisible();
  const renamedSecondGroup = `${secondGroup} Renamed`;
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Group" }).click();
  await expect(page).toHaveURL(/\/settings\/group$/);
  await page.getByLabel("Group name").fill(renamedSecondGroup);
  await page.getByRole("button", { name: "Rename group" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My profile" }).click();
  await expect(page.getByRole("heading", { name: "Creator" })).toBeVisible();
  await expect(page.getByText("Learning together, one useful phrase at a time.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No posts to show yet" })).toBeVisible();
  await page.getByRole("link", { name: "Journal" }).click();
  await expect(page.getByRole("heading", { name: renamedSecondGroup })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByLabel("Active group").selectOption({ label: "🇳🇱 Alpha Journal" });
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  await page.getByRole("link", { name: /join requests? waiting/ }).click();
  await expect(page).toHaveURL(/\/settings\/members$/);
  const request = page.getByText(memberName, { exact: true }).locator("../../..");
  await request.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("button", { name: "Accept" })).toBeHidden();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await page.getByLabel("Email").fill(memberEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(memberPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  const desktopNavigation = page.getByRole("navigation", { name: "Main navigation" });
  const mobileNavigation = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(desktopNavigation).toBeVisible();
  await expect(mobileNavigation).toBeHidden();
  await expect(desktopNavigation.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Active group")).toBeVisible();
  await expect(desktopNavigation.locator("svg")).toHaveCount(3);
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
  await expect(mobileNavigation.getByRole("link", { name: "Journal" })).toHaveAttribute("aria-current", "page");
  await expect(mobileNavigation.getByRole("link")).toHaveCount(5);
  const dockBox = await mobileNavigation.boundingBox();
  expect(dockBox).not.toBeNull();
  expect(dockBox!.x).toBeGreaterThan(0);
  expect(dockBox!.width).toBeLessThan(390);
  expect(dockBox!.y + dockBox!.height).toBeLessThan(844);
  await page.setViewportSize({ width: 390, height: 500 });
  const compactDockBox = await mobileNavigation.boundingBox();
  expect(compactDockBox).not.toBeNull();
  expect(compactDockBox!.y).toBeGreaterThan(0);
  expect(compactDockBox!.y + compactDockBox!.height).toBeLessThan(500);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
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
