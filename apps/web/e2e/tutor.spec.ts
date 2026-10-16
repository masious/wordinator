import { expect, test } from "@playwright/test";
import { studyNextLessonWithTutor } from "./tutor";

test("the tutor teaches the next lesson, and a reset from the lesson page starts it over", async ({ page }, testInfo) => {
  const { lessonTitle } = await studyNextLessonWithTutor(page, testInfo);

  await page.getByRole("tab", { name: "Lessons" }).click();
  await page.getByRole("link", { name: /^Open lesson 1:/ }).click();
  await page.getByRole("button", { name: "Reset lesson" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset this lesson?" });
  await expect(dialog.getByText(`Start ${lessonTitle} over. This permanently deletes:`)).toBeVisible();
  await dialog.getByRole("button", { name: "Reset lesson" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("tab", { name: "Progress" }).click();
  const progress = page.getByRole("region", { name: "Your progress" });
  await expect(progress.getByText("0 of 2 lessons completed")).toBeVisible();
  await expect(progress.getByRole("listitem").filter({ hasText: lessonTitle }).getByText("Not started", { exact: true })).toBeVisible();
});
