import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, openLesson, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// The New words panel filters the lesson's own words, or searches the library and links each match to its lesson.
test("a learner searches the lesson's words and the library from the New words panel", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const tag = `zoek${uniqueTag(testInfo)}`;
  await signIn(page);
  const api = courseApi(page);
  const course = async (title: string) => {
    const { course: created } = await api<{ course: { id: string } }>("/courses", { title, summary: "Woorden" });
    await api(`/courses/${created.id}/visibility`, { status: "published" });
    return created.id;
  };
  const animals = await course(`${tag} animals`);
  await seedLesson(page, animals, `${tag} pets`, [
    vocabulary({ term: `de hond ${tag}`, meaning: "the dog" }, { term: `de kat ${tag}`, meaning: "the cat" }, { term: "het café", meaning: `the coffee house ${tag}` }),
    paragraph("Huisdieren."),
  ]);
  const travel = await course(`${tag} travel`);
  await seedLesson(page, travel, `${tag} station`, [vocabulary({ term: `de trein ${tag}`, meaning: "the train" }), paragraph("Op het station.")]);
  await seedLesson(page, travel, `${tag} hidden`, [vocabulary({ term: `het geheim ${tag}`, meaning: "the secret" }), paragraph("Nog niet.")], { publish: false });

  await page.goto(`/courses/${animals}`);
  await openLesson(page);
  const panel = page.getByRole("complementary", { name: "New words" });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  const lessonBox = panel.getByRole("searchbox", { name: "Search this lesson's words" });
  await lessonBox.fill("CAFE");
  await expect(panel.getByRole("listitem")).toHaveCount(1);
  await expect(panel).toContainText("het café");
  await lessonBox.fill("dog");
  await expect(panel.getByRole("listitem")).toHaveText([new RegExp(`de hond ${tag}`)]);
  await lessonBox.fill("trein");
  await expect(panel.getByRole("status")).toHaveText("No word in this lesson matches your search.");

  await panel.getByText("Library", { exact: true }).click();
  const libraryBox = panel.getByRole("searchbox", { name: "Search words in the library" });
  await libraryBox.fill(tag);
  const results = panel.getByRole("list", { name: "Library matches" });
  // Term matches come before the meaning match; the unpublished lesson's word is left out.
  await expect(results.getByRole("listitem")).toHaveText([new RegExp(`de hond ${tag}`), new RegExp(`de kat ${tag}`), new RegExp(`de trein ${tag}`), /het café/]);
  await expect(panel).not.toContainText("het geheim");

  const source = results.getByRole("listitem").filter({ hasText: `de trein ${tag}` })
    .getByRole("link", { name: `Introduced in ${tag} station (${tag} travel). Open the lesson` });
  await source.hover();
  await expect(page.getByText(`${tag} travel · ${tag} station`)).toBeVisible();
  await source.click();
  await expect(page).toHaveURL(/\/lessons\/[^/]+$/);
  await expect(page.getByRole("heading", { name: `${tag} station` })).toBeVisible();
});
