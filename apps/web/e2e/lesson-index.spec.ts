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
    // Practices are left out of the index; a level-3 heading is listed under its level-2 with a colour dot.
    heading("Weather", 3), heading("Small talk"), practice("Answer the questions about the weather.", [{ prompt: "Regent het?", authorsVersion: ["Ja"] }]), ...section("Praat"), vocabulary({ term: "het weer", meaning: "the weather" }),
    heading("Goodbyes"), ...section("Dag"),
  ]);

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  const index = page.getByRole("navigation", { name: "In this lesson" });
  await expect(index.getByRole("button")).toHaveText(["Greetings", "Weather", "Small talk", "Goodbyes"]);
  await expect(index.getByRole("button", { name: "Weather" }).locator('[data-color="pink"]')).toHaveCount(1);
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
  // The sticky header has slid in over the reading column with the lesson's title and the current section, and the jump left the
  // entry's heading just under it rather than behind it.
  const header = page.locator("[data-lesson-header] > div");
  await expect(header).toHaveAttribute("data-shown", "true");
  await expect(header).toContainText(`${suffix} lesson`);
  await expect(header).toContainText("Goodbyes");
  const headerBox = (await header.boundingBox())!;
  const headerBottom = headerBox.y + headerBox.height;
  // It spans the main column, from the app rail's edge to the New words panel's (a classic scrollbar may tuck its end under the
  // right rail).
  const [railEdge, panelEdge] = [(await page.getByRole("navigation", { name: "In this lesson" }).boundingBox())!, (await page.getByRole("complementary", { name: "New words" }).boundingBox())!];
  expect(headerBox.x).toBeGreaterThanOrEqual(railEdge.x + railEdge.width);
  expect(headerBox.x - (railEdge.x + railEdge.width)).toBeLessThan(40);
  expect(headerBox.x + headerBox.width).toBeGreaterThanOrEqual(panelEdge.x - 1);
  expect(headerBox.x + headerBox.width - panelEdge.x).toBeLessThan(40);
  // Its text lines up with the reading column.
  const textBox = (await header.getByText(`${suffix} lesson`).boundingBox())!;
  const columnBox = (await page.getByText("Dag zin 1.").locator("xpath=ancestor::article[1]").boundingBox())!;
  expect(Math.abs(textBox.x - columnBox.x)).toBeLessThan(2);
  const goodbyes = page.getByRole("main").getByRole("heading", { name: "Goodbyes" });
  // Its block starts on the reading line; the heading's own top margin puts its text a little lower.
  const offset = (await goodbyes.boundingBox())!.y - headerBottom;
  expect(offset).toBeGreaterThanOrEqual(0);
  expect(offset).toBeLessThan(24);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: process.env.E2E_SHOTS });
  await index.getByRole("button", { name: "Small talk" }).click();
  await expect(index.getByRole("button", { name: "Small talk" })).toHaveAttribute("aria-current", "location");
  // Goodbyes was reached, so it stays unlocked after scrolling back.
  await expect(index.getByRole("button", { name: "Goodbyes" })).toHaveAttribute("data-state", "passed");
  // Each listed heading in the text carries the same badge as its entry, or its colour dot.
  await expect(page.getByRole("main").locator("[data-badged]")).toHaveCount(4);

  // The profile row's Study time button shows the Study time card and shrinks the lesson box to its label and progress.
  const box = page.getByRole("region", { name: "This lesson" });
  await expect(box).not.toHaveAttribute("data-compact");
  await page.getByRole("button", { name: "Study time" }).click();
  await expect(page.getByRole("region", { name: "Study time" })).toBeVisible();
  await expect(box).toHaveAttribute("data-compact", "true");
  await page.getByRole("button", { name: "Study time" }).click();
  await expect(box).not.toHaveAttribute("data-compact");

  // The lesson's actions sit in the panel's footer, not in the app rail. With room for the panel beside the text (above 75em) it
  // cannot collapse.
  const actions = page.getByRole("group", { name: "Lesson actions" });
  await expect(actions).toHaveCount(1);
  await expect(words.getByRole("group", { name: "Lesson actions" }).getByRole("link", { name: "Practise words" })).toBeVisible();
  await expect(words.getByRole("button", { name: /^New words/ })).toHaveCount(0);

  // Where the rail is narrowed (up to 75em), the panel collapses to a slim column of icons, stays collapsed after a reload, and
  // keeps the actions as icons at its foot.
  await page.setViewportSize({ width: 1150, height: 800 });
  const toggle = words.getByRole("button", { name: /^New words/ });
  await toggle.click();
  await expect(words).toHaveAttribute("data-rail-slim");
  await expect(words.getByRole("searchbox")).toHaveCount(0);
  expect((await words.boundingBox())!.width).toBeLessThan(80);
  await expect(words.getByRole("link", { name: "Practise words" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("complementary", { name: "New words" })).toHaveAttribute("data-rail-slim");
  await page.getByRole("complementary", { name: "New words" }).getByRole("button", { name: "Show new words" }).click();
  await expect(page.getByRole("complementary", { name: "New words" }).getByText("het weer")).toBeVisible();

  // Every page's profile row has the Study time button; the card stays hidden until it is pressed.
  await page.goto("/journal");
  const study = page.getByRole("button", { name: "Study time" });
  await expect(study).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("region", { name: "Study time" })).toHaveCount(0);
  await study.click();
  await expect(page.getByRole("region", { name: "Study time" })).toBeVisible();
});
