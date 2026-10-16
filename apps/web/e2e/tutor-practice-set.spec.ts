import { expect, test } from "@playwright/test";
import { PRACTICE_SET_REQUEST } from "./aiStub";
import { askTutor, seedTutorCourse } from "./tutor";

// A practice set waits in the question dock in place of the composer (docs/ai-tutor.md#practice-sets): the learner moves through
// it with Next and Previous, changes an earlier answer, and checks the whole set at once; the results then show in the chat.
test("answers a practice set in the question dock and checks it at once", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  await seedTutorCourse(page, testInfo, "dock");
  await askTutor(page, PRACTICE_SET_REQUEST);
  const dock = page.getByRole("region", { name: "Your tutor’s questions" });
  await expect(dock.getByText("Question 1 of 3 · checked together")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message your tutor" })).toBeHidden();
  await expect(page.getByText("Answer the 3 questions below.")).toBeVisible();

  // A pick moves on; Previous comes back with it kept, and it can change.
  await dock.getByRole("button", { name: /the tree/ }).click();
  await expect(dock.getByText("Question 2 of 3 · checked together")).toBeVisible();
  await dock.getByRole("textbox", { name: "Your translation" }).fill("Ik drink water.");
  await dock.getByRole("button", { name: "Previous" }).click();
  await expect(dock.getByRole("button", { name: /the tree/ })).toHaveAttribute("aria-pressed", "true");
  await dock.getByRole("button", { name: /the house/ }).click();
  await expect(dock.getByRole("textbox", { name: "Your translation" })).toHaveValue("Ik drink water.");
  await dock.getByRole("button", { name: "Next" }).click();

  // The last question: Next became Check answers.
  await expect(dock.getByText("Question 3 of 3 · checked together")).toBeVisible();
  await expect(dock.getByRole("button", { name: "Next" })).toHaveCount(0);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/dock.png` });
  for (const chunk of ["Ik", "drink", "water"]) await dock.getByRole("button", { name: `Add “${chunk}”` }).click();
  await dock.getByRole("button", { name: "Check answers" }).click();

  await expect(page.getByText("You answered 3 of 3.")).toBeVisible();
  await expect(dock).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Message your tutor" })).toBeEnabled();
  await expect(page.getByText("Matches!")).toHaveCount(3);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/dock-after.png`, fullPage: true });
});
