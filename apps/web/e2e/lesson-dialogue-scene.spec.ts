import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, dialogue, heading, openLesson, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// The dialogue scene page (docs/courses.md#dialogue-scene-pages) keeps the staged conversation on wide windows and shows the phone
// player below 48em; one view is mounted at a time, and the line reached carries over when the window crosses the breakpoint.
const TURNS = [
  { speaker: "Ober", text: "Hebt u een reservering?" },
  { speaker: "Daan", text: "Ja, voor vier personen." },
  { speaker: "Sofia", text: "Mogen wij bij het raam zitten?" },
];

async function openScene(page: Page, testInfo: TestInfo) {
  const suffix = `scene-${uniqueTag(testInfo)}-${testInfo.testId.slice(0, 8)}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Uit eten" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [
    heading("Een tafel bij het raam"),
    paragraph("Vier vrienden gaan uit eten."),
    dialogue(TURNS),
    vocabulary({ term: "het raam", meaning: "window" }),
  ]);
  await page.goto(`/courses/${course.id}`, { waitUntil: "networkidle" });
  await openLesson(page);
  await page.waitForURL(/\/dialogues\//);
}

test("wide windows keep the staged conversation, and a narrow window swaps in the player on the same line", async ({ page }, testInfo) => {
  await openScene(page, testInfo);
  const player = page.getByRole("region", { name: "Dialogue player" });
  await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();
  await expect(player).toHaveCount(0);
  await page.getByRole("button", { name: "Begin" }).click();
  await page.getByRole("button", { name: "Start conversation" }).click();
  await page.getByRole("button", { name: "Next line" }).click();
  await expect(page.getByText("Line 2 / 3")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(player).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin" })).toHaveCount(0);
  await expect(player.getByRole("button", { name: "Line 2, Daan" })).toHaveAttribute("aria-current", "true");
  await player.getByRole("button", { name: "Next line" }).click();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(player).toHaveCount(0);
  await expect(page.getByText("Line 3 / 3")).toBeVisible();
});
