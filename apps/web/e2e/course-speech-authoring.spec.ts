import { expect, test } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, openLesson, seedLesson, vocabulary } from "./lessonSeed";
import { markSpeechReady, serveSpeech } from "./speech";

// The worker is stubbed: clips are marked ready in the local database under the hashes it would use, and the editor's polling
// picks the change up. The page clock jumps to the next poll instead of waiting for it.
test("an author sets a pronunciation and sees the word's audio go from pending to ready", async ({ page }, testInfo) => {
  testInfo.setTimeout(60_000);
  const suffix = `speech-authoring-${uniqueTag(testInfo)}`;
  await page.clock.install();
  await signIn(page);
  const played = await serveSpeech(page);

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Uitspraak" });
  const words = vocabulary({ term: "voorkomen", meaning: "to occur" });
  await seedLesson(page, course.id, `${suffix} lesson`, [words], { publish: false });
  await markSpeechReady([words]);

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  const block = page.getByRole("region", { name: "New words" });
  await expect(block.getByText("Audio ready")).toBeVisible();
  await block.getByRole("button", { name: "Play pronunciation of voorkomen" }).click();
  await expect.poll(() => played.length).toBe(1);

  await block.getByRole("button", { name: "Forms, example, note, and pronunciation for word 1" }).click();
  const ipa = block.getByLabel(/^Word 1 pronunciation \(IPA\)/);
  await ipa.fill("voːr<b>");
  await expect(block.getByText(/^Use IPA letters/)).toBeVisible();
  await ipa.fill("ˈvoːrkoːmə");
  await expect(block.getByText(/^Use IPA letters/)).toHaveCount(0);
  await expect(block.getByText(/^Audio pending/)).toBeVisible();
  const bar = page.getByRole("region", { name: "Lesson saving and publishing" });
  await expect(bar.getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });

  // The job "runs": the overridden term's clip becomes ready, and the next poll shows it.
  const [word] = JSON.parse(String((words.props as { data: string }).data)).words as Array<Record<string, unknown>>;
  await markSpeechReady([{ ...words, props: { data: JSON.stringify({ words: [{ ...word, ipa: "ˈvoːrkoːmə" }] }) } }]);
  await page.clock.runFor(15_000); // SPEECH_STATUS_POLL_MS in LessonEditor
  await expect(block.getByText("Audio ready")).toBeVisible();
  await block.getByRole("button", { name: "Play pronunciation of voorkomen" }).click();
  await expect.poll(() => played.length).toBe(2);
  expect(played[0]).not.toBe(played[1]);
});
