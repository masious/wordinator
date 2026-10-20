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
    // Practices and level-3 headings are left out of the index.
    heading("Weather", 3), heading("Small talk"), practice("Answer the questions about the weather.", [{ prompt: "Regent het?", authorsVersion: ["Ja"] }]), ...section("Praat"), vocabulary({ term: "het weer", meaning: "the weather" }),
    heading("Goodbyes"), ...section("Dag"),
  ]);

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  const index = page.getByRole("navigation", { name: "In this lesson" });
  await expect(index.getByRole("button")).toHaveText(["Greetings", "Small talk", "Goodbyes"]);
  const words = page.getByRole("complementary", { name: "New words" });
  // The index sits in the app rail, left of the text; the New words panel is docked in the right rail.
  const [indexBox, wordsBox] = [await index.boundingBox(), await words.boundingBox()];
  expect(indexBox!.x + indexBox!.width).toBeLessThanOrEqual(wordsBox!.x);

  // Choosing an entry scrolls to it; it becomes current and the entries before it are dimmed. The column stays in view.
  await index.getByRole("button", { name: "Goodbyes" }).click();
  await expect(index.getByRole("button", { name: "Goodbyes" })).toHaveAttribute("aria-current", "location");
  await expect(index.getByRole("button", { name: "Greetings" })).toHaveAttribute("data-state", "passed");
  await expect(index.getByRole("button", { name: "Small talk" })).toHaveAttribute("data-state", "passed");
  await expect(page.getByText("Dag zin 1.")).toBeInViewport();
  await expect(index).toBeInViewport();
  await index.getByRole("button", { name: "Small talk" }).click();
  await expect(index.getByRole("button", { name: "Small talk" })).toHaveAttribute("aria-current", "location");
  // Goodbyes was reached, so it stays unlocked after scrolling back.
  await expect(index.getByRole("button", { name: "Goodbyes" })).toHaveAttribute("data-state", "passed");
  // Each listed heading in the text carries the same badge as its entry.
  await expect(page.getByRole("main").locator("[data-badged]")).toHaveCount(3);

  // The profile row's Study time button shows the Study time card and shrinks the lesson box to its label and progress.
  const box = page.getByRole("region", { name: "This lesson" });
  await expect(box).not.toHaveAttribute("data-compact");
  await page.getByRole("button", { name: "Study time" }).click();
  await expect(page.getByRole("region", { name: "Study time" })).toBeVisible();
  await expect(box).toHaveAttribute("data-compact", "true");
  await page.getByRole("button", { name: "Study time" }).click();
  await expect(box).not.toHaveAttribute("data-compact");

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

  // Every page's profile row has the Study time button; the card stays hidden until it is pressed.
  await page.goto("/journal");
  const study = page.getByRole("button", { name: "Study time" });
  await expect(study).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "Study time" })).toHaveCount(0);
  await study.click();
  await expect(page.getByRole("region", { name: "Study time" })).toBeVisible();
});
