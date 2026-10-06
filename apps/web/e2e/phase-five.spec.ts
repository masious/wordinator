import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_INVITATION_TOKEN, E2E_PASSWORD } from "./global-setup";

test.afterEach(async ({ page }) => {
  await page.request.post("/api/auth/sign-in", { data: { email: E2E_CREATOR_EMAIL, password: E2E_PASSWORD } });
  await page.request.post(`/api/groups/${E2E_GROUP_ID}/restore`);
});

test("member lifecycle, temporary passwords, and recoverable group deletion work end to end", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const suffix = `phase5-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`; const memberEmail = `${suffix}@e2e.test`; const memberPassword = "phase-five-member"; const nextPassword = "phase-five-changed"; const memberName = `${suffix} learner`;
  const signIn = async (email: string, password: string, heading = "Alpha Journal") => { await page.goto("/"); await page.getByLabel("Email").fill(email); await page.getByRole("textbox", { name: "Password" }).fill(password); await page.getByRole("button", { name: "Sign in" }).click(); if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible(); };
  const signOut = async () => {
    const accountMenu = page.getByRole("button", { name: "Account menu" });
    if (await accountMenu.isVisible()) { await accountMenu.click(); await page.getByRole("menuitem", { name: "Sign out" }).click(); }
    else await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  };

  await signIn(E2E_CREATOR_EMAIL, E2E_PASSWORD);
  await signOut(); await page.goto(`/invite/${E2E_INVITATION_TOKEN}`); await page.getByLabel("Display name").fill(memberName); await page.getByLabel("Email").fill(memberEmail); await page.getByRole("textbox", { name: "Password" }).fill(memberPassword); await page.getByRole("button", { name: "Create account and request access" }).click(); await expect(page.getByText("Waiting for approval")).toBeVisible();
  await page.goto("/"); await signOut(); await signIn(E2E_CREATOR_EMAIL, E2E_PASSWORD); await page.getByRole("link", { name: /join requests? waiting/ }).click(); const request = page.getByText(memberName, { exact: true }).locator("../../.."); await request.getByRole("button", { name: "Accept" }).click();
  const row = page.getByRole("link", { name: memberName, exact: true }).locator("../../.."); await expect(row).toBeVisible(); await row.getByRole("button", { name: "New temporary password" }).click(); const temporary = await page.locator("code").textContent(); expect(temporary).toBeTruthy();
  await signOut(); await page.goto("/"); await page.getByLabel("Email").fill(memberEmail); await page.getByRole("textbox", { name: "Password" }).fill(temporary!); await page.getByRole("button", { name: "Sign in" }).click(); await expect(page.getByRole("heading", { name: "Choose a new password." })).toBeVisible(); await page.getByLabel("New password").fill(nextPassword); await page.getByRole("button", { name: "Save password" }).click(); await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  await page.getByRole("link", { name: "Members" }).first().click(); await page.getByRole("button", { name: "Leave group" }).click(); await page.getByRole("dialog", { name: "Leave this group" }).getByRole("button", { name: "Leave group" }).click(); await expect(page.getByText("This request is not active. You can use the invitation again to request access.")).toBeVisible();
  await signOut(); await signIn(E2E_CREATOR_EMAIL, E2E_PASSWORD); await page.getByRole("link", { name: "Members" }).first().click(); await expect(page.getByRole("heading", { name: "Former members" })).toBeVisible(); await expect(page.getByText(memberName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click(); await page.getByRole("menuitem", { name: "Settings" }).click(); await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Group" }).click(); await page.getByRole("button", { name: "Delete group" }).click(); await page.getByRole("dialog", { name: "Delete group" }).getByRole("button", { name: "Delete group" }).click();
  const restore = page.getByRole("button", { name: "Restore group" });
  await expect.poll(async () => await restore.isVisible() || /^\/groups\/[^/]+$/.test(new URL(page.url()).pathname)).toBe(true);
  if (!await restore.isVisible()) { const activePath = new URL(page.url()).pathname; await page.goto(`${activePath}/settings`); }
  await expect(restore).toBeVisible(); await restore.click(); await page.goto(`/groups/${E2E_GROUP_ID}`); await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
});
