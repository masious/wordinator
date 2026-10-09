import { test } from "@playwright/test";
import { playLessonSpeech } from "./speech";

test("a learner plays a word, an example, and a dialogue", async ({ page }, testInfo) => {
  await playLessonSpeech(page, testInfo);
});
