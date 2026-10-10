import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, example, openLesson, seedLesson } from "./lessonSeed";

test("scrolling a lesson page fills its bar, saves the furthest step, and the player resumes there", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `reading-${uniqueTag(testInfo)}`;
  await signIn(page);

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Lezen" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  // Twelve examples make one step each and a page several windows tall.
  const sentences = Array.from({ length: 12 }, (_, index) => `Zin nummer ${index + 1} staat hier.`);
  await seedLesson(page, course.id, `${suffix} lesson`, sentences.map((sentence) => example(sentence, `Sentence ${sentence.length}.`, "Een notitie om de pagina langer te maken.")));

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  const bar = page.getByRole("progressbar", { name: "Lesson progress" });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");

  // Part of the way down, the furthest step reached is saved through the position API, and after a reload the bar starts from
  // that saved position at the top of the page, in the player's step unit.
  const partway = page.waitForResponse((response) => response.url().endsWith("/position") && response.request().method() === "PUT");
  await page.mouse.wheel(0, 400);
  const { position: middle } = await (await partway).json() as { position: { stepIndex: number; totalSteps: number } };
  expect(middle.stepIndex).toBeGreaterThan(0);
  expect(middle.stepIndex).toBeLessThan(11);
  const middlePercent = String(Math.round(((middle.stepIndex + 1) / middle.totalSteps) * 100));
  await expect(bar).toHaveAttribute("aria-valuenow", middlePercent);
  await page.reload();
  await expect(page.getByText(`Step ${middle.stepIndex + 1} of 12`)).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", middlePercent);

  // Reaching the bottom fills the bar and, once the reader pauses, saves the last step.
  const saved = page.waitForResponse((response) => response.url().endsWith("/position") && response.request().method() === "PUT");
  await page.mouse.wheel(0, 20_000);
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect((await response.json()).position).toMatchObject({ stepIndex: 11, passedSteps: 11, totalSteps: 12 });
  await expect(page.getByText("Step 12 of 12")).toBeVisible();

  // Eleven of twelve steps passed in the only lesson.
  await page.getByRole("link", { name: /^Back to / }).click();
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Your course progress" })).toHaveAttribute("aria-valuenow", "91");
  await page.getByRole("button", { name: "Continue lesson 1", exact: true }).click();
  const player = page.getByRole("dialog");
  await expect(player.getByText("Step 12 of 12")).toBeVisible();
  await expect(player.getByText("Picked up where you left off.")).toBeVisible();
});
