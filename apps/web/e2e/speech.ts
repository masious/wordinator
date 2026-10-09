import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { LessonDocument } from "@wordinator/contracts/lesson-document";
import { speechClipHash, speechItems } from "@wordinator/contracts/speech";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, dialogue, example, openLesson, seedLesson, vocabulary } from "./lessonSeed";

// Browser tests never call Azure, so a lesson's clips are marked ready directly in the local database, under the same hashes the
// worker would use, and the browser is served a short generated WAV for every clip URL.
export async function markSpeechReady(blocks: Array<Record<string, unknown>>) {
  const items = speechItems({ schemaVersion: 2, blocks } as LessonDocument, null, "nl");
  const now = Date.now();
  const rows = await Promise.all(items.map(async (item) => `('${await speechClipHash(item)}','${item.voice}',${item.text.length},'ready',1,${now},${now})`));
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "wordinator", "--local", "--persist-to", "../../.wrangler/e2e", "--command",
    `INSERT OR REPLACE INTO speech_clips (hash,voice,characters,status,attempts,created_at,updated_at) VALUES ${rows.join(",")};`],
  { cwd: resolve(import.meta.dirname, "../../api"), stdio: "ignore" });
}

// One second of silence as 8 kHz, 16-bit mono PCM.
function silence(seconds = 1) {
  const rate = 8000; const data = rate * seconds * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + data, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(data, 40);
  return wav;
}

export async function serveSpeech(page: Page) {
  const played: string[] = [];
  await page.route("**/speech/*.mp3", (route) => {
    played.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: "audio/wav", body: silence() });
  });
  return played;
}

// A learner plays a word, an example, and a dialogue on the lesson page, and a word and a dialogue line in the player.
export async function playLessonSpeech(page: Page, testInfo: TestInfo) {
  testInfo.setTimeout(60_000);
  const suffix = `speech-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  const played = await serveSpeech(page);

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Luisteren" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const blocks = [
    example("Ik drink water.", "I drink water."),
    vocabulary({ term: "het water", meaning: "the water", example: "Het water is koud." }),
    dialogue([{ speaker: "Anna", text: "Hallo!" }, { speaker: "Ben", text: "Hoi, hoe gaat het?" }]),
  ];
  await seedLesson(page, course.id, `${suffix} lesson`, blocks);
  await markSpeechReady(blocks);

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  await openLesson(page);
  const word = page.getByRole("complementary", { name: "New words" }).getByRole("button", { name: "Play pronunciation of het water" });
  await word.click();
  await expect(word).toHaveAttribute("aria-pressed", "true");
  await expect(word).toHaveAttribute("aria-pressed", "false");
  const sentence = page.getByRole("button", { name: "Play the example sentence" });
  await sentence.click();
  await expect(sentence).toHaveAttribute("aria-pressed", "true");
  await expect(sentence).toHaveAttribute("aria-pressed", "false");
  // Play dialogue marks each line in turn, then offers to play again.
  await page.getByRole("button", { name: "Play dialogue" }).click();
  const first = page.getByRole("listitem").filter({ hasText: "Hallo!" }); const second = page.getByRole("listitem").filter({ hasText: "Hoi, hoe gaat het?" });
  await expect(first).toHaveAttribute("aria-current", "true");
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Play dialogue" })).toBeVisible();
  await expect(second).not.toHaveAttribute("aria-current");
  expect(played).toHaveLength(4);

  // In the player, a word plays from the step's New words panel and a line from the dialogue stage.
  await page.getByRole("link", { name: /^Back to / }).click();
  await page.getByRole("button", { name: "Start lesson 1" }).click();
  const player = page.getByRole("dialog");
  const panelWord = player.getByRole("region", { name: "New words" }).getByRole("button", { name: "Play pronunciation of het water" });
  await panelWord.click();
  await expect(panelWord).toHaveAttribute("aria-pressed", "true");
  // Moving on stops the clip.
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Hallo!")).toBeVisible();
  const line = player.getByRole("button", { name: "Play line 1, Anna" });
  await line.click();
  await expect(line).toHaveAttribute("aria-pressed", "true");
  await expect(line).toHaveAttribute("aria-pressed", "false");
}
