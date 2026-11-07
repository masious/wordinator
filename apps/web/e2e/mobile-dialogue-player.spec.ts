import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, dialogue, heading, openLesson, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// On a phone the dialogue scene page is a player (docs/courses.md#dialogue-scene-pages): the line's cover, the lines like synced
// lyrics, a scrubber with a segment per line, and the transport, all inside the viewport's width.
const TURNS = [
  { speaker: "Ober", text: "Hebt u een reservering?" },
  { speaker: "Daan", text: "Ja, voor vier personen, op naam van De Vries." },
  { speaker: "Sofia", text: "Mogen wij bij het raam zitten?" },
];

async function expectNoHorizontalOverflow(page: Page) {
  const deviceWidth = page.viewportSize()?.width ?? 0;
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth))).toBeLessThanOrEqual(deviceWidth);
}

test("a phone opens the dialogue as a player that steps through the lines and returns to the lesson", async ({ page }, testInfo) => {
  const suffix = `player-${uniqueTag(testInfo)}-${testInfo.testId.slice(0, 8)}`;
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

  const player = page.getByRole("region", { name: "Dialogue player" });
  await expect(player).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin" })).toHaveCount(0);
  await expect(player.getByRole("heading", { name: "Een tafel bij het raam" })).toBeVisible();
  await expect(player.getByRole("button", { name: "Line 1, Ober" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "New words in this dialogue" })).toBeAttached();
  await expectNoHorizontalOverflow(page);

  await player.getByRole("button", { name: "Next line" }).click();
  await expect(player.getByRole("button", { name: "Line 2, Daan" })).toHaveAttribute("aria-current", "true");
  await player.getByRole("button", { name: "Show the conversation instead of the picture" }).click();
  await expect(player.getByRole("heading", { name: "Conversation" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  if (process.env.MOBILE_SHOTS) await page.screenshot({ path: `${process.env.MOBILE_SHOTS}/${test.info().project.name}-dialogue-player.png` });

  await player.getByRole("button", { name: "Back to lesson" }).click();
  await expect(page).toHaveURL(/\/lessons\/[^/]+(#.*)?$/);
});
