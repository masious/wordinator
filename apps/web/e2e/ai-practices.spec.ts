import { expect, test } from "@playwright/test";
import { SAVE_PRACTICE_REQUEST } from "./aiStub";
import { askTutor, seedTutorCourse } from "./tutor";

test("a practice the tutor saves shows on the lesson page, is answered there, and can be removed", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const { courseId } = await seedTutorCourse(page, testInfo, "aipractice");

  await askTutor(page, SAVE_PRACTICE_REQUEST);
  await expect(page.getByText(/^Save this .+ practice for everyone who reads this lesson\?$/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("The practice is saved.")).toBeVisible();

  await page.goto(`/courses/${courseId}`);
  await page.getByRole("link", { name: /^Open lesson 1:/ }).click();
  await page.getByRole("button", { name: "Show AI practices (1)" }).click();
  const practice = page.getByRole("region", { name: "AI practice" });
  await practice.getByRole("textbox", { name: "Your answer" }).fill("water");
  await practice.getByRole("button", { name: "Check" }).click();
  await expect(practice.getByText("Matches!")).toBeVisible();

  // The learner owns this course, so they may remove the practice.
  await practice.getByRole("button", { name: "Remove from this lesson" }).click();
  await page.getByRole("dialog", { name: "Remove this AI practice from the lesson?" }).getByRole("button", { name: "Remove from this lesson" }).click();
  await expect(practice).toHaveCount(0);
  await expect(page.getByRole("button", { name: /AI practices/ })).toHaveCount(0);
});
