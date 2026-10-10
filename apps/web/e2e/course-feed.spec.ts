import { expect, test } from "@playwright/test";
import { E2E_GROUP_ID } from "./global-setup";
import { signIn } from "./auth";

test("publishing a course announces it in the feed with visible comments", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const title = `feed-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}-${Date.now()} course`;
  await signIn(page);

  const api = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await page.request.fetch(`/api/groups/${E2E_GROUP_ID}${path}`, { method: "POST", data: body });
    expect(response.ok()).toBe(true);
    return response.json() as Promise<T>;
  };
  const { course } = await api<{ course: { id: string; slug: string } }>("/courses", { title, summary: "Samen leren" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });

  await page.goto("/journal");
  const card = page.locator("article").filter({ hasText: title }).first();
  await expect(card.getByText("Published a new course")).toBeVisible();
  await card.getByRole("link").first().click();
  await page.getByLabel("Comment").fill("Ik doe mee!");
  await page.getByRole("button", { name: /Publish/ }).click();
  await expect(page.getByText("Ik doe mee!")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal answers" })).toHaveCount(0);

  await page.getByRole("link", { name: new RegExp(title) }).click();
  // The feed card links by course ID, which lands on the readable slug URL.
  await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}$`));
  expect(course.slug).toMatch(/^feed-[a-z]+-\d+-course$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
