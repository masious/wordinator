import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, openLesson, practice, seedLesson } from "./lessonSeed";

test("a learner answers a practice with on-device checks, finishes it later, and is counted as done", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `practice-${uniqueTag(testInfo)}`;
  await signIn(page);

  // Course content is authored through the API with the signed-in session; the journey under test is practising.
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Mijn huis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [practice("Vul in of vertaal.", [
    { prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "Eén keuken." }, { prompt: "There are two bedrooms.", authorsVersion: ["Er zijn twee slaapkamers."] },
  ])]);

  // Answers are checked on the device: no request carries one.
  const checks: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/check")) checks.push(request.url()); });
  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  // The lesson page lists the prompts with who is done and what is left; answering happens in a dialog.
  await expect(page.getByText("Vul in of vertaal.")).toBeVisible();
  await expect(page.getByText("There are two bedrooms.")).toBeVisible();
  await expect(page.getByText("Nobody done yet · 2 questions left")).toBeVisible();
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Answer the practice" });
  await expect(dialog.getByRole("button", { name: "Reveal answers" })).toHaveCount(0);
  await expect(dialog.getByText("Er zijn twee slaapkamers.")).toHaveCount(0);
  // The dialog opens on the first question, with the practice's progress bar at its top.
  const first = dialog.getByLabel(/^1\. … een kleine keuken\./); const second = dialog.getByLabel(/^2\. There are two bedrooms\./);
  await expect(first).toBeFocused();
  await expect(dialog.getByText("Question 1 of 2")).toBeVisible();
  await expect(dialog.getByRole("progressbar", { name: "Practice progress" })).toHaveAttribute("aria-valuenow", "50");
  // A miss keeps focus and shows the author's version; a match moves on to the next question.
  await first.fill("Daar is");
  await first.press("Enter");
  await expect(dialog.getByText("Author’s version")).toBeVisible();
  await expect(first).toBeFocused();
  await first.fill("er is");
  await first.press("Enter");
  await expect(dialog.getByText("Matches the author’s version")).toBeVisible();
  await expect(second).toBeFocused();
  await expect(dialog.getByText("Question 2 of 2")).toBeVisible();
  await expect(dialog.getByRole("progressbar", { name: "Practice progress" })).toHaveAttribute("aria-valuenow", "100");
  await first.fill("Er is");
  // Closing the dialog saves progress just like its button.
  await dialog.getByRole("button", { name: "Finish later" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Nobody done yet · 1 question left")).toBeVisible();

  // The answers stay on this device; answering the rest makes the learner done.
  await page.reload();
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(dialog.getByLabel(/^1\. … een kleine keuken\./)).toHaveValue("Er is");
  // The dialog reopens on the unanswered question; a match in the last question moves focus to Done.
  await expect(second).toBeFocused();
  await second.fill("Er zijn twee slaapkamers");
  await second.press("Enter");
  await expect(dialog.getByRole("button", { name: "Done" })).toBeFocused();
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("1 person done · You’re done")).toBeVisible();
  expect(checks).toEqual([]);
});
