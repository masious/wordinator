import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, example, heading, openLesson, practice, seedLesson, vocabulary } from "./lessonSeed";

test("the lesson index follows the reader, jumps to an entry, and sits above a collapsible New words panel", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `index-${uniqueTag(testInfo)}`;
  await signIn(page);

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Inhoud" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  // Each section is several examples long, so the page is several windows tall.
  const section = (topic: string) => Array.from({ length: 5 }, (_, index) => example(`${topic} zin ${index + 1}.`, "A sentence.", "Een notitie om de pagina langer te maken."));
  await seedLesson(page, course.id, `${suffix} lesson`, [
    heading("Greetings"), ...section("Groet"), vocabulary({ term: "hallo", meaning: "hello" }),
    practice("Translate into English", [{ prompt: "Hallo", authorsVersion: ["Hello"] }]),
    heading("Small talk", 3), ...section("Praat"), vocabulary({ term: "het weer", meaning: "the weather" }),
    heading("Goodbyes"), ...section("Dag"),
  ]);

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  const index = page.getByRole("navigation", { name: "In this lesson" });
  await expect(index.getByRole("button")).toHaveText(["Greetings", "Practice: Translate into English", "Small talk", "Goodbyes"]);
  const words = page.getByRole("complementary", { name: "New words" });
  // The index sits above the New words panel in the same column.
  const [indexBox, wordsBox] = [await index.boundingBox(), await words.boundingBox()];
  expect(indexBox!.y + indexBox!.height).toBeLessThanOrEqual(wordsBox!.y);

  // Choosing an entry scrolls to it; it becomes current and the entries before it are dimmed. The column stays in view.
  await index.getByRole("button", { name: "Goodbyes" }).click();
  await expect(index.getByRole("button", { name: "Goodbyes" })).toHaveAttribute("aria-current", "location");
  await expect(index.getByRole("button", { name: "Greetings" })).toHaveAttribute("data-passed", "true");
  await expect(page.getByText("Dag zin 1.")).toBeInViewport();
  await expect(index).toBeInViewport();
  await index.getByRole("button", { name: "Small talk" }).click();
  await expect(index.getByRole("button", { name: "Small talk" })).toHaveAttribute("aria-current", "location");
  await expect(index.getByRole("button", { name: "Goodbyes" })).not.toHaveAttribute("data-passed");

  // Collapsed, the panel keeps only its title with the number of highlighted words, and stays collapsed after a reload.
  const toggle = words.getByRole("button", { name: /^New words/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(words.getByRole("searchbox")).toHaveCount(0);
  await expect(toggle).toContainText(/\d+ highlighted/);
  await page.reload();
  await expect(page.getByRole("complementary", { name: "New words" }).getByRole("button", { name: /^New words/ })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("complementary", { name: "New words" }).getByRole("button", { name: /^New words/ }).click();
  await expect(page.getByRole("complementary", { name: "New words" }).getByText("het weer")).toBeVisible();
});
