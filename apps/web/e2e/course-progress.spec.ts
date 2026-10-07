import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, dialogue, example, practice, seedLesson } from "./lessonSeed";

test("a learner steps through a lesson and the course shows their progress", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `progress-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Op reis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} first`, [
    example("Waar is het station?", "Where is the station?"),
    dialogue([{ speaker: "A", text: "Rechtdoor." }, { speaker: "B", text: "Dank je wel." }]),
    practice("Vertaal.", [{ prompt: "Turn left." }]),
  ]);
  await seedLesson(page, course.id, `${suffix} second`, [example("Tot ziens.")]);

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  const progress = page.getByRole("progressbar", { name: "Course progress for", exact: false }).first();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Start lesson 1" }).click();

  const player = page.getByRole("dialog");
  await expect(player.getByText("Step 1 of 4")).toBeVisible();
  await player.getByRole("button", { name: "Show translation" }).click();
  await expect(player.getByText("Where is the station?")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Rechtdoor.")).toBeVisible();
  await expect(player.getByText("Dank je wel.")).toHaveCount(0);
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Dank je wel.")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Question 1 of 1")).toBeVisible();
  await player.getByLabel("Your answer").fill("Ga linksaf.");
  await player.getByRole("button", { name: "Finish lesson" }).click();

  await expect(player.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(player.getByText("You have finished 1 of 2 lessons (50%).")).toBeVisible();
  await player.getByRole("button", { name: "Back to the course" }).click();
  await expect(page.getByRole("button", { name: "Practise lesson 1 again" })).toBeVisible();
  await expect(page.getByText("1 of 2 lessons")).toBeVisible();

  // The answer typed in the player stays as the practice draft in the lesson view.
  await expect(page.getByLabel(/^1\. Turn left\./)).toHaveValue("Ga linksaf.");
});
