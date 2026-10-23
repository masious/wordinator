import { expect, test } from "@playwright/test";
import { registerAccount, uniqueTag } from "./auth";
import { E2E_GROUP_ID } from "./global-setup";
import { courseApi, example, openLesson, seedLesson, vocabulary } from "./lessonSeed";

test("a member bookmarks words on a lesson page and reviews them on the Words tab", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `words-tab-${uniqueTag(testInfo)}`;
  await registerAccount(page, testInfo, "wordtab");
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
    // The toggle sits in the word's details, behind its Show more chevron.
    await panel.getByRole("button", { name: `Show more about ${term}` }).click();
    await panel.getByRole("button", { name: `Bookmark ${term}` }).click();
    await expect(panel.getByRole("button", { name: `Bookmark ${term}` })).toHaveAttribute("aria-pressed", "true");
  }

  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Words", exact: true }).click();
  await expect(page).toHaveURL(/\/words$/);
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  // Newest first: the word bookmarked last leads. Each row shows its meaning and links to its lesson.
  const words = page.getByRole("list", { name: "Bookmarked words" });
  await expect(words.getByRole("listitem").first()).toHaveAttribute("aria-label", `het spoor ${suffix}`);
  const ticket = words.getByRole("listitem", { name: `het kaartje ${suffix}` });
  await expect(ticket).toContainText(`${suffix} course · ${lessonTitle}`);
  await expect(ticket.getByText("the ticket")).toBeVisible();

  // Removing a bookmark leaves the row where it is until the page is left.
  const toggle = ticket.getByRole("button", { name: `Bookmark het kaartje ${suffix}` });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(500);
  await expect(ticket).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your words" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: `het spoor ${suffix}` })).toBeVisible();
  await expect(page.getByRole("listitem", { name: `het kaartje ${suffix}` })).toHaveCount(0);

  // The lesson filter narrows the tab to one lesson and keeps it in the URL across a reload.
  await page.getByRole("combobox", { name: "Lesson" }).click();
  await page.getByRole("option", { name: `${lessonTitle} (1)` }).click();
  await expect(page).toHaveURL(/\/words\?lesson=/);
  await expect(page.getByRole("listitem", { name: `het spoor ${suffix}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Lesson" })).toHaveValue(`${lessonTitle} (1)`);
  await expect(page.getByRole("listitem", { name: `het spoor ${suffix}` })).toBeVisible();
  // The lesson link opens the word's lesson.
  await page.getByRole("link", { name: `Open lesson ${lessonTitle}` }).first().click();
  await expect(page).toHaveURL(/\/courses\/[^/]+\/lessons\//);
});
