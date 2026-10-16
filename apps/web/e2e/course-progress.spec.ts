import { expect, test } from "@playwright/test";
import { registerAccount, uniqueTag } from "./auth";
import { courseApi, dialogue, example, practice, seedLesson } from "./lessonSeed";

// The player is retired from the course page (docs/courses.md#lesson-player): the card's action opens the lesson page, a saved
// place counts in part, and a completion (recorded here through the API, as the tutor's confirmation does) moves the card on.
test("the course card opens lessons on their page and follows the learner's progress", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `progress-${uniqueTag(testInfo)}`;
  // A fresh account, so the card follows only this test's progress.
  await registerAccount(page, testInfo, "progress");

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Op reis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const talk = dialogue([{ speaker: "A", text: "Rechtdoor." }, { speaker: "B", text: "Dank je wel." }]);
  const firstId = await seedLesson(page, course.id, `${suffix} first`, [
    example("Waar is het station?", "Where is the station?"),
    talk,
    practice("Vertaal.", [{ prompt: "Turn left.", authorsVersion: ["Sla linksaf."] }]),
  ]);
  await seedLesson(page, course.id, `${suffix} second`, [example("Tot ziens.")]);

  await page.goto(`/courses/${course.id}`);
  // Progress is private, so the course page shows only the viewer's own bar; the course header carries it first (Lumen Batch 5).
  const progress = page.getByRole("progressbar", { name: "Your course progress" }).first();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "Start lesson 1", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: `${suffix} first`, level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // A saved place on the dialogue's second line (as scrolling the lesson page saves it): two of four steps passed in one of two
  // lessons is a quarter of the course, and the card offers to continue there.
  await api(`/courses/${course.id}/lessons/${firstId}/position`, { stepKey: `${talk.id}:1` }, "PUT");
  await page.goto(`/courses/${course.id}`);
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "25");
  await page.getByRole("button", { name: "Continue lesson 1", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/[^?]+\?resume=true$/);

  // A completed lesson counts whole, and the card moves on to the next unfinished lesson.
  await api(`/courses/${course.id}/lessons/${firstId}/completion`, {}, "PUT");
  await page.goto(`/courses/${course.id}`);
  await expect(progress).toHaveAttribute("aria-valuenow", "50");
  await expect(page.getByRole("button", { name: "Start lesson 2", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Open lesson 1:/ }).getByRole("img", { name: "Finished" })).toBeVisible();
});
