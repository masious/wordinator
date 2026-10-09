import { test } from "@playwright/test";
import { playLessonSpeech } from "./speech";

// The same journey at phone sizes, where the lesson page's New words panel follows the text.
test("a learner plays a word, an example, and a dialogue on a phone", async ({ page }, testInfo) => {
  await playLessonSpeech(page, testInfo);
});
