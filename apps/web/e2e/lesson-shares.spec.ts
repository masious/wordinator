import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, example, openLesson, practice, seedLesson } from "./lessonSeed";

// Lesson shares (docs/lesson-shares.md): a learner shares pieces of a published lesson to the journal.
test("a learner shares an example and a question, opens them in the journal, and checks an answer on the post page", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `share-${uniqueTag(testInfo)}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Mijn huis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [
    example(`Er is een balkon ${suffix}.`, "There is a balcony.", "Er is = there is."),
    practice("Vertaal.", [{ prompt: `There is a garden ${suffix}.`, authorsVersion: ["Er is een tuin."], note: "Editor only." }]),
  ]);
  await page.goto(`/courses/${course.id}`);
  await openLesson(page);

  // Clicking the example reveals its Share button; the confirmation prefills the example's note.
  await page.getByText(`Er is een balkon ${suffix}.`).click();
  await page.getByRole("button", { name: "Share this example" }).click();
  const share = page.getByRole("dialog", { name: "Share an example" });
  await expect(share.getByLabel(/Your note/)).toHaveValue("Er is = there is.");
  await share.getByRole("button", { name: "Share", exact: true }).click();
  await expect(share).toHaveCount(0);
  const already = page.getByRole("link", { name: "Already shared. Open the post" });
  await expect(already).toBeVisible();

  // A question is shared from the Answer dialog; a second attempt reads Already shared.
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  const answers = page.getByRole("dialog", { name: "Answer the practice" });
  await answers.getByRole("button", { name: "Share question 1" }).click();
  const shareQuestion = page.getByRole("dialog", { name: "Share a question" });
  await expect(shareQuestion.getByLabel(/Your note/)).toHaveValue("");
  await shareQuestion.getByRole("button", { name: "Share", exact: true }).click();
  await expect(answers.getByRole("link", { name: "Already shared. Open the post" })).toBeVisible();
  await answers.getByRole("button", { name: "Finish later" }).click();

  // Both shares are in the journal; the example plays from the card, which links to its post through the byline.
  await page.goto("/journal");
  const exampleByline = page.getByRole("link", { name: new RegExp(`shared an example from lesson 1 of ${suffix} course`) });
  await expect(exampleByline).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`shared a question from lesson 1 of ${suffix} course`) })).toBeVisible();
  await exampleByline.click();
  await expect(page).toHaveURL(/\/journal\/[^/]+$/);
  await expect(page.getByText(`Er is een balkon ${suffix}.`)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the lesson/ })).toBeVisible();
  await page.getByRole("button", { name: "Show notes" }).click();
  await expect(page.getByText("Er is = there is.").last()).toBeVisible();

  // The question's post page checks an answer on the device; nothing is sent.
  const sent: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET") sent.push(request.url()); });
  await page.goto("/journal");
  await page.getByRole("link", { name: new RegExp(`shared a question from lesson 1 of ${suffix} course`) }).click();
  await expect(page.getByText(`There is a garden ${suffix}.`)).toBeVisible();
  await expect(page.getByText("Editor only.")).toHaveCount(0);
  const field = page.getByRole("textbox", { name: "Your answer" });
  await field.fill("Er is een huis");
  await field.press("Enter");
  await expect(page.getByText("Author’s version", { exact: true })).toBeVisible();
  await field.fill("er is een tuin");
  await field.press("Enter");
  await expect(page.getByText("Matches the author’s version")).toBeVisible();
  expect(sent).toEqual([]);
});
