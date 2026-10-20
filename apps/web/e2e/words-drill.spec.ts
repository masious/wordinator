import { expect, test, type Page } from "@playwright/test";
import { WORD_DRILL_SESSION_SIZE } from "@wordinator/contracts/lesson-document";
import { registerAccount, uniqueTag } from "./auth";
import { courseApi, seedLesson, vocabulary } from "./lessonSeed";

type SeedWord = { id: string; term: string; meaning: string };

// A published course with one lesson per word list; every word is bookmarked through the API, like the bookmark toggle does.
async function seedBookmarkedLessons(page: Page, suffix: string, lessons: SeedWord[][]) {
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  for (const [index, words] of lessons.entries()) {
    const lessonId = await seedLesson(page, course.id, `${suffix} lesson ${index + 1}`, [vocabulary(...words)]);
    for (const word of words) await api(`/courses/${course.id}/lessons/${lessonId}/words/${word.id}/bookmark`, {}, "PUT");
  }
}

async function startDrill(page: Page, direction: "Mixed" | "Understand Dutch") {
  await page.goto("/words");
  await page.getByRole("button", { name: "Drill", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Drill words" });
  await expect(dialog.getByRole("radio", { name: "Weak words" })).toBeChecked();
  await dialog.getByRole("radio", { name: direction }).check();
  await dialog.getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/words\/drill\?/);
}

// Walks a session to its summary, returning the word number each card showed in order. `grade` picks each presentation's grade.
async function walkSession(page: Page, pattern: RegExp, grade: (number: number, presentation: number) => "Again" | "Got it") {
  const card = page.getByRole("article", { name: "Drill card" });
  const shown: number[] = [];
  for (let presentation = 0; presentation < 60; presentation += 1) {
    const done = page.getByRole("region", { name: "Session done" });
    const showAnswer = card.getByRole("button", { name: "Show answer" });
    await expect(done.or(showAnswer)).toBeVisible();
    if (await done.isVisible()) return shown;
    await showAnswer.click();
    const number = Number(pattern.exec(await card.textContent() ?? "")?.[1]);
    expect(number, "the card names a seeded word").toBeGreaterThan(0);
    shown.push(number);
    await card.getByRole("button", { name: grade(number, presentation) }).click();
  }
  throw new Error("The session did not end.");
}

test("a mixed drill never shows a term twice, revealing with Space and grading with 2", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `drill-mixed-${uniqueTag(testInfo)}`;
  await registerAccount(page, testInfo, "drillmix");
  const word = (n: number, meaning = `meaning ${n}`): SeedWord => ({ id: crypto.randomUUID(), term: `t${n}-${suffix}`, meaning });
  // The same term in two lessons is two bookmarks but one card.
  await seedBookmarkedLessons(page, suffix, [[word(1), word(2), word(3), word(4)], [word(1, "another meaning"), word(5)]]);

  await startDrill(page, "Mixed");
  await expect(page).toHaveURL(/source=weak/);
  await expect(page).toHaveURL(/direction=mixed/);
  const card = page.getByRole("article", { name: "Drill card" });
  await expect(page.getByText("0 of 5 done")).toBeVisible();
  const terms: number[] = [];
  for (let step = 0; step < 5; step += 1) {
    await expect(card.getByRole("button", { name: "Show answer" })).toBeVisible();
    await card.focus();
    await page.keyboard.press("Space");
    await expect(card.getByRole("button", { name: "Got it" })).toBeVisible();
    terms.push(Number(new RegExp(`t(\\d)-${suffix}`).exec(await card.textContent() ?? "")?.[1]));
    await page.keyboard.press("2");
    await expect(page.getByText(`${step + 1} of 5 done`).or(page.getByRole("region", { name: "Session done" }))).toBeVisible();
  }
  expect([...terms].sort()).toEqual([1, 2, 3, 4, 5]);
  await expect(page.getByRole("region", { name: "Session done" })).toBeVisible();
  await page.getByRole("button", { name: "Back to words" }).click();
  await expect(page).toHaveURL(/\/words$/);
});

test("a Weak words drill starts with the word graded Again and the words never drilled", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const suffix = `drill-weak-${uniqueTag(testInfo)}`;
  await registerAccount(page, testInfo, "drillweak");
  // More words than a session holds, so the next deck's choice shows the priority; few enough that the next deck fits the word
  // graded Again and every word never drilled.
  const words = Array.from({ length: WORD_DRILL_SESSION_SIZE + 5 }, (_, index): SeedWord => ({ id: crypto.randomUUID(), term: `w${index + 1}-${suffix}`, meaning: `meaning ${index + 1}` }));
  await seedBookmarkedLessons(page, suffix, [words]);
  const pattern = new RegExp(`w(\\d+)-${suffix}`);

  await startDrill(page, "Understand Dutch");
  let again = 0;
  const first = await walkSession(page, pattern, (number, presentation) => {
    if (presentation === 0) again = number;
    return presentation === 0 ? "Again" : "Got it";
  });
  const firstDeck = new Set(first);
  expect(firstDeck.size).toBe(WORD_DRILL_SESSION_SIZE);
  // The word graded Again came back later in the session; only its first grade counted.
  expect(first.filter((number) => number === again)).toHaveLength(2);

  // Drill again draws a fresh deck: the word graded Again, then the five never drilled, then the rest.
  await page.getByRole("button", { name: "Drill again" }).click();
  const second = new Set(await walkSession(page, pattern, () => "Got it"));
  expect(second.size).toBe(WORD_DRILL_SESSION_SIZE);
  expect(second.has(again)).toBe(true);
  for (const number of words.map((_, index) => index + 1).filter((number) => !firstDeck.has(number))) expect(second.has(number), `w${number} never drilled`).toBe(true);
});
