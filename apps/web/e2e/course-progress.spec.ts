import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, dialogue, example, openLesson, practice, seedLesson } from "./lessonSeed";

test("a learner steps through a lesson, resumes it, and the course shows their progress", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `progress-${uniqueTag(testInfo)}`;
  await signIn(page);

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Op reis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} first`, [
    example("Waar is het station?", "Where is the station?"),
    dialogue([{ speaker: "A", text: "Rechtdoor." }, { speaker: "B", text: "Dank je wel." }]),
    practice("Vertaal.", [{ prompt: "Turn left.", authorsVersion: ["Sla linksaf."] }]),
  ]);
  await seedLesson(page, course.id, `${suffix} second`, [example("Tot ziens.")]);

  await page.goto(`/courses/${course.id}`);
  const progress = page.getByRole("progressbar", { name: "Course progress for", exact: false }).first();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Start lesson 1", exact: true }).click();

  const player = page.getByRole("dialog");
  await expect(player.getByText("Step 1 of 4")).toBeVisible();
  // The translation shows with the sentence.
  await expect(player.getByText("Where is the station?")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Rechtdoor.")).toBeVisible();
  await expect(player.getByText("Dank je wel.")).toHaveCount(0);
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Dank je wel.")).toBeVisible();

  // Leaving mid-lesson keeps the step: two of four steps passed in one of two lessons is a quarter of the course.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Your course progress" })).toHaveAttribute("aria-valuenow", "25");
  await expect(progress).toHaveAttribute("aria-valuenow", "25");
  await page.getByRole("button", { name: "Continue lesson 1", exact: true }).click();
  await expect(player.getByText("Step 3 of 4")).toBeVisible();
  await expect(player.getByText("Picked up where you left off.")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Question 1 of 1")).toBeVisible();
  await player.getByLabel("Your answer").fill("Ga linksaf.");
  // The first press checks the filled answer against the author's version; the next one finishes.
  await player.getByRole("button", { name: "Finish lesson" }).click();
  await expect(player.getByText("Author’s version")).toBeVisible();
  await player.getByRole("button", { name: "Finish lesson" }).click();

  await expect(player.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(player.getByText("You have finished 1 of 2 lessons (50%).")).toBeVisible();
  await player.getByRole("button", { name: "Back to the course" }).click();
  // The single course action moves on to the next unfinished lesson.
  await expect(page.getByRole("button", { name: "Start lesson 2", exact: true })).toBeVisible();
  await expect(page.getByText("1 of 2 lessons")).toBeVisible();

  // The answer typed in the player stays as the practice draft on the lesson page.
  await openLesson(page);
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Answer the practice" }).getByLabel(/^1\. Turn left\./)).toHaveValue("Ga linksaf.");
});
