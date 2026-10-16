import { test } from "@playwright/test";
import { studyNextLessonWithTutor } from "./tutor";

// The tutor is the one phone-width exception to desktop first (docs/what_is_it.md#desktop-first); the flow checks that the chat
// fits the viewport.
test("the tutor teaches the next lesson at phone width", async ({ page }, testInfo) => {
  await studyNextLessonWithTutor(page, testInfo);
});
