import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import type { Page } from "@playwright/test";
import { courseApi, example, openLesson, seedLesson } from "./lessonSeed";

// An unstarted lesson opens behind the start gate (docs/courses.md#lesson-pages); pressing it saves the first step as the position.
async function pressStart(page: Page) {
  await expect(page.getByRole("main").getByRole("progressbar", { name: "Lesson progress" })).toHaveCount(0);
  const started = page.waitForResponse((response) => response.url().endsWith("/position") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Start reading this lesson" }).click();
  expect((await (await started).json()).position).toMatchObject({ stepIndex: 0 });
  // Pressing it scrolled the button into view; start reading from the top again.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

test("scrolling a lesson page fills its bar, saves the furthest step, and Continue reopens the page there", async ({ page }, testInfo) => {
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
  await openLesson(page, 1, { start: false });
  await pressStart(page);
  // The page's reading bar; the rail's lesson box carries a second Lesson progress meter. Starting saved step 1 of 12.
  const bar = page.getByRole("main").getByRole("progressbar", { name: "Lesson progress" });
  await expect(bar).toHaveAttribute("aria-valuenow", "8");

  // Part of the way down, the furthest step reached is saved through the position API, and after a reload the bar starts from
  // that saved position at the top of the page. Without practices the bar is the share of reading steps reached, rounded down.
  const partway = page.waitForResponse((response) => response.url().endsWith("/position") && response.request().method() === "PUT");
  // Starting saved step 1, so the wheel has to pass at least the second step.
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 700);
  const { position: middle } = await (await partway).json() as { position: { stepIndex: number; totalSteps: number } };
  expect(middle.stepIndex).toBeGreaterThan(0);
  expect(middle.stepIndex).toBeLessThan(11);
  const middlePercent = String(Math.floor(((middle.stepIndex + 1) / middle.totalSteps) * 100 + 1e-9));
  await expect(bar).toHaveAttribute("aria-valuenow", middlePercent);
  await page.reload();
  await expect(page.getByText(`Step ${middle.stepIndex + 1} of 12`)).toBeVisible();
  await expect(bar).toHaveAttribute("aria-valuenow", middlePercent);

  // Reaching the bottom fills the bar and, once the reader pauses, saves the last step, which completes a lesson without practices.
  const saved = page.waitForResponse((response) => response.url().endsWith("/position") && response.request().method() === "PUT");
  await page.mouse.wheel(0, 20_000);
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ position: { stepIndex: 11, passedSteps: 11, totalSteps: 12 }, completed: true });
  await expect(page.getByRole("main").getByText("Finished", { exact: true })).toBeVisible();

  // The finished lesson counts whole, and the course page offers it again from the top.
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: `${suffix} course` }).click();
  await expect(page.getByRole("progressbar", { name: "Your course progress" }).first()).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("button", { name: `Start lesson 1 again: ${suffix} lesson` })).toBeVisible();
});

test("Continue opens the lesson page scrolled to a saved step in the middle", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `resume-${uniqueTag(testInfo)}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Lezen" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const sentences = Array.from({ length: 12 }, (_, index) => `Zin nummer ${index + 1} staat hier.`);
  await seedLesson(page, course.id, `${suffix} lesson`, sentences.map((sentence) => example(sentence, `Sentence ${sentence.length}.`, "Een notitie om de pagina langer te maken.")));

  await page.goto(`/courses/${course.id}`);
  await openLesson(page, 1, { start: false });
  await pressStart(page);
  await expect(page.getByRole("main").getByRole("progressbar", { name: "Lesson progress" })).toHaveAttribute("aria-valuenow", "8");
  const saved = page.waitForResponse((response) => response.url().endsWith("/position") && response.request().method() === "PUT");
  await page.mouse.wheel(0, 900);
  const { position } = await (await saved).json() as { position: { stepIndex: number } };
  expect(position.stepIndex).toBeGreaterThan(1);
  expect(position.stepIndex).toBeLessThan(10);
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: `${suffix} course` }).click();
  await page.getByRole("button", { name: `Continue lesson 1: ${suffix} lesson` }).click();
  await expect(page).toHaveURL(/\?resume=true$/);
  // The saved step sits near the top of the window; the lesson's start is scrolled past.
  const step = page.getByText(sentences[position.stepIndex]!, { exact: true });
  await expect(step).toBeInViewport();
  await expect(page.getByText(sentences[0]!, { exact: true })).not.toBeInViewport();
  const top = await step.evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeLessThan(250);
});
