import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";

test("publishing a course announces it in the feed with visible comments", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const title = `feed-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}-${Date.now()} course`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  const api = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await page.request.fetch(`/api/groups/${E2E_GROUP_ID}${path}`, { method: "POST", data: body });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<T>;
  };
  const { course } = await api<{ course: { id: string } }>("/courses", { title, summary: "Samen leren" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });

  await page.goto(`/groups/${E2E_GROUP_ID}`);
  const card = page.locator("article").filter({ hasText: title }).first();
  await expect(card.getByText("Published a new course")).toBeVisible();
  await card.getByRole("link").first().click();
  await page.getByLabel("Comment").fill("Ik doe mee!");
  await page.getByRole("button", { name: /Publish/ }).click();
  await expect(page.getByText("Ik doe mee!")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal answers" })).toHaveCount(0);

  await page.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${course.id}$`));
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
