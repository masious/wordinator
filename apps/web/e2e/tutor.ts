import { expect, type Page, type TestInfo } from "@playwright/test";
import { NEXT_LESSON_REQUEST } from "./aiStub";
import { registerAccount, uniqueTag } from "./auth";
import { courseApi, dialogue, example, seedLesson } from "./lessonSeed";

// A fresh learner asks the tutor (answered by the stub provider in aiStub.ts) for their next lesson: the lesson look-up shows as a
// tool step, the fill-in on its example is answered, the completion card is confirmed, and the course's Progress tab shows the
// lesson completed. Shared by the desktop spec and the phone-width spec.
export async function studyNextLessonWithTutor(page: Page, testInfo: TestInfo) {
  testInfo.setTimeout(90_000);
  const suffix = `tutor-${uniqueTag(testInfo)}`;
  await registerAccount(page, testInfo, "tutor");
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Met de tutor" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const lessonTitle = `${suffix} first`;
  const talk = dialogue([{ speaker: "A", text: "Hallo!" }, { speaker: "B", text: "Hoi." }]);
  const lessonId = await seedLesson(page, course.id, lessonTitle, [example("Ik drink water.", "I drink water."), talk]);
  await seedLesson(page, course.id, `${suffix} second`, [example("Tot ziens.")]);

  // A saved place in the first lesson (as the player saves it) makes this course the one the tutor's next lesson comes from,
  // whatever else the shared database holds.
  await api(`/courses/${course.id}/lessons/${lessonId}/position`, { stepKey: `${talk.id}:0` }, "PUT");

  await page.goto("/ai");
  await page.getByRole("textbox", { name: "Message your tutor" }).fill(NEXT_LESSON_REQUEST);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(`Looked up ${lessonTitle}`)).toBeVisible();
  await expect(page.getByText(`Let's practise ${lessonTitle}.`)).toBeVisible();

  const fillIn = page.getByRole("region", { name: "Fill in the blank" });
  await fillIn.getByRole("textbox", { name: "Your answer" }).fill("water");
  await fillIn.getByRole("button", { name: "Check" }).click();
  await expect(fillIn.getByText("Matches!")).toBeVisible();

  await expect(page.getByText(`Mark ${lessonTitle} in ${suffix} course as complete?`)).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(`${lessonTitle} is complete.`)).toBeVisible();
  // The chat fits the viewport, which matters at phone width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.goto(`/courses/${course.id}`);
  await page.getByRole("tab", { name: "Progress" }).click();
  const progress = page.getByRole("region", { name: "Your progress" });
  await expect(progress.getByText("1 of 2 lessons completed")).toBeVisible();
  await expect(progress.getByRole("listitem").filter({ hasText: lessonTitle }).getByText("Completed", { exact: true })).toBeVisible();
  return { courseId: course.id, lessonTitle };
}
