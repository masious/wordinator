import { expect, test } from "@playwright/test";
import { registerAccount, uniqueTag } from "./auth";
import { E2E_GROUP_ID } from "./global-setup";
import { courseApi, example, openLesson, seedLesson, vocabulary } from "./lessonSeed";
import { pageToWord } from "./wordRecap";

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

  // On a lesson page the rail moves Words, Journal, and Tutor into its compact More navigation row.
  await page.getByRole("navigation", { name: "More navigation" }).getByRole("link", { name: "Words", exact: true }).click();
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
  // The cards and Back and Next fit the first screen. One row of the Words tab's roomy cards needs about 730px under the header,
  // so this checks a common laptop height rather than the default 720px window, where the one row the page always shows overflows.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => { const next = await page.getByRole("button", { name: "Next" }).boundingBox(); return next!.y + next!.height; }).toBeLessThanOrEqual(800);

  // The lesson filter narrows the tab to one lesson and keeps it in the URL across a reload.
  await page.getByRole("combobox", { name: "Lesson" }).click();
  await page.getByRole("option", { name: `${lessonTitle} (1)` }).click();
  await expect(page).toHaveURL(/\/words\?lesson=/);
  await expect(page.getByRole("article", { name: `het spoor ${suffix}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Lesson" })).toHaveValue(`${lessonTitle} (1)`);
  await expect(page.getByRole("article", { name: `het spoor ${suffix}` })).toBeVisible();
});
