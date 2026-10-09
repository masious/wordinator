import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, example, openLesson, seedLesson, vocabulary } from "./lessonSeed";
import { pageToWord } from "./wordRecap";

test("a member bookmarks words on a lesson page and reviews them on the Words tab", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `words-tab-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.request.post("/api/auth/sign-in", { data: { email: E2E_CREATOR_EMAIL, password: E2E_PASSWORD } });
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const lessonTitle = `${suffix} lesson`;
  await seedLesson(page, course.id, lessonTitle, [
    example("Ik koop een kaartje.", "I buy a ticket."),
    vocabulary({ term: `het kaartje ${suffix}`, meaning: "the ticket" }, { term: `het spoor ${suffix}`, meaning: "the track" }),
  ]);

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  await openLesson(page);
  const panel = page.getByRole("complementary", { name: "New words" });
  for (const term of [`het kaartje ${suffix}`, `het spoor ${suffix}`]) {
    await panel.getByRole("button", { name: `Bookmark ${term}` }).click();
    await expect(panel.getByRole("button", { name: `Bookmark ${term}` })).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Words" }).click();
  await expect(page).toHaveURL(/\/words$/);
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  // Newest first: the word bookmarked last leads.
  await expect(page.getByRole("article").first()).toHaveAttribute("aria-label", `het spoor ${suffix}`);
  const ticket = await pageToWord(page.locator("main"), `het kaartje ${suffix}`);
  await expect(ticket).toContainText(`${suffix} course · ${lessonTitle}`);
  await ticket.getByRole("button", { name: "Show meaning" }).click();
  await expect(ticket.getByText("the ticket")).toBeVisible();

  // Removing a bookmark leaves the card where it is until the page is left.
  const toggle = ticket.getByRole("button", { name: `Bookmark het kaartje ${suffix}` });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(500);
  await expect(ticket).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  await expect(page.getByRole("article", { name: `het spoor ${suffix}` })).toBeVisible();
  await expect(page.getByRole("article", { name: `het kaartje ${suffix}` })).toHaveCount(0);
  // The cards and Back and Next fit the first screen.
  const next = await page.getByRole("button", { name: "Next" }).boundingBox();
  expect(next!.y + next!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});
