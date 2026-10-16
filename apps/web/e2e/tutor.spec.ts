import { expect, test } from "@playwright/test";
import { registerAccount } from "./auth";
import { studyNextLessonWithTutor } from "./tutor";

test("the tutor keeps recent conversations in the app rail and session details in one dialog", async ({ page }, testInfo) => {
  await registerAccount(page, testInfo, "tutorlayout");
  const create = async (title: string) => {
    const response = await page.request.post("/api/ai/conversations");
    expect(response.ok()).toBe(true);
    const { conversation } = await response.json() as { conversation: { id: string } };
    const renamed = await page.request.patch(`/api/ai/conversations/${conversation.id}`, { data: { title } });
    expect(renamed.ok()).toBe(true);
    return conversation.id;
  };
  await create("A deliberately long conversation title about separable verbs and daily routines");
  const openId = await create("Practising de and het");

  await page.goto(`/ai?conversation=${openId}`);
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(navigation.getByRole("link", { name: /Practising de and het/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("complementary", { name: "Session context" })).toBeVisible();

  await page.getByRole("button", { name: "Conversation details" }).click();
  const dialog = page.getByRole("dialog", { name: "Conversation details" });
  await expect(dialog.getByRole("textbox", { name: "Conversation title" })).toHaveValue("Practising de and het");
  await expect(dialog.getByText("Tokens spent")).toBeVisible();
  await expect(dialog.getByText("Activities completed")).toBeVisible();
});

test("the tutor teaches the next lesson, and a reset from the lesson page starts it over", async ({ page }, testInfo) => {
  const { lessonTitle } = await studyNextLessonWithTutor(page, testInfo);

  await page.getByRole("tab", { name: "Lessons" }).click();
  await page.getByRole("link", { name: /^Open lesson 1:/ }).click();
  await page.getByRole("button", { name: "Reset lesson" }).click();
  const dialog = page.getByRole("dialog", { name: "Reset this lesson?" });
  await expect(dialog.getByText(`Start ${lessonTitle} over. This permanently deletes:`)).toBeVisible();
  await dialog.getByRole("button", { name: "Reset lesson" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("tab", { name: "Progress" }).click();
  const progress = page.getByRole("region", { name: "Your progress" });
  await expect(progress.getByText("0 of 2 lessons completed")).toBeVisible();
  await expect(progress.getByRole("listitem").filter({ hasText: lessonTitle }).getByText("Not started", { exact: true })).toBeVisible();
});
