import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, example, practice, seedLesson, vocabulary } from "./lessonSeed";

test("each lesson on the course page starts or continues, reviews its words, and practices again", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `actions-${uniqueTag(testInfo)}`;
  await signIn(page);

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Op de markt" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const opening = example("Twee euro.");
  const firstId = await seedLesson(page, course.id, `${suffix} first`, [
    example("Wat kost dat?", "What does that cost?"), vocabulary({ term: "de appel", meaning: "the apple" }, { term: "duur", meaning: "expensive" }),
    opening,
    practice("Vertaal.", [{ prompt: "The apple is expensive.", authorsVersion: ["De appel is duur."] }]),
    practice("Maak een vraag.", [{ prompt: "duur / de appel", authorsVersion: ["Is de appel duur?"] }]),
  ]);
  await seedLesson(page, course.id, `${suffix} second`, [example("Tot ziens.")]);

  await page.goto(`/courses/${course.id}`);
  const first = `${suffix} first`;
  // A lesson without words or practices offers only its start.
  await expect(page.getByRole("button", { name: `Start lesson 2: ${suffix} second` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Review the words of lesson 2: ${suffix} second` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Practice lesson 2 again: ${suffix} second` })).toHaveCount(0);

  // Review words shows the lesson's own words as cards.
  await page.getByRole("button", { name: `Review the words of lesson 1: ${first}` }).click();
  const recap = page.getByRole("dialog", { name: "Words of lesson 1" });
  await expect(recap.getByRole("article", { name: "de appel" })).toBeVisible();
  await expect(recap.getByRole("article", { name: "duur" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(recap).toHaveCount(0);

  // Practice again lists the lesson's practices and opens the chosen one's answer set.
  await page.getByRole("button", { name: `Practice lesson 1 again: ${first}` }).click();
  const practices = page.getByRole("dialog", { name: "Practices in lesson 1" });
  await expect(practices.getByRole("button", { name: /Vertaal\./ })).toContainText("1 question");
  await practices.getByRole("button", { name: /Maak een vraag\./ }).click();
  await practices.getByLabel(/^1\. duur \/ de appel/).fill("Is de appel duur?");
  await practices.getByRole("button", { name: "Done" }).click();
  await expect(practices.getByRole("button", { name: /Maak een vraag\./ })).toContainText("Done");
  await page.keyboard.press("Escape");

  // Start opens the lesson's own page (the player is retired from the course page); once a place is saved in the lesson, its
  // action turns into Continue, which opens the page at that place.
  await page.getByRole("button", { name: `Start lesson 1: ${first}` }).click();
  await expect(page).toHaveURL(/\/lessons\/[^/?]+$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await api(`/courses/${course.id}/lessons/${firstId}/position`, { stepKey: opening.id }, "PUT");
  await page.goto(`/courses/${course.id}`);
  await page.getByRole("button", { name: `Continue lesson 1: ${first}` }).click();
  await expect(page).toHaveURL(/\/lessons\/[^?]+\?resume=true$/);
});
