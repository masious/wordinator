import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_PASSWORD } from "./global-setup";

test("a member publishes, browses, edits, and deletes every Phase 3 post shape", async ({ page }, testInfo) => {
  const prefix = testInfo.project.name;
  await page.goto("/");
  await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  const openComposer = async () => {
    await page.getByRole("button", { name: "Create post" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  };

  const sentence = `${prefix} goedemorgen`;
  await openComposer();
  await page.getByLabel("Sentence").fill(sentence);
  await page.getByLabel("Notes or hint").fill(`${prefix} hidden note`);
  await page.getByRole("button", { name: "Publish post" }).click();
  const sentenceCard = page.locator("article").filter({ hasText: sentence });
  await expect(sentenceCard).toBeVisible();
  await expect(sentenceCard.getByText(`${prefix} hidden note`)).toBeHidden();
  await sentenceCard.getByRole("button", { name: "Show notes" }).click();
  await expect(sentenceCard.getByText(`${prefix} hidden note`)).toBeVisible();

  const question = `${prefix} hoe gaat het?`;
  await openComposer();
  await page.getByRole("combobox", { name: "Post type" }).click();
  await page.getByRole("option", { name: "Question" }).click();
  await page.getByLabel("Question").fill(question);
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(page.locator("article").filter({ hasText: question })).toBeVisible();

  const reading = `${prefix} een kort verhaal`;
  await openComposer();
  await page.getByRole("combobox", { name: "Post type" }).click();
  await page.getByRole("option", { name: "Reading" }).click();
  await page.getByLabel("Paragraph").fill(reading);
  await page.getByLabel("Question 1").fill("Wat gebeurt er?");
  await page.getByRole("button", { name: "Publish post" }).click();
  const readingCard = page.locator("article").filter({ hasText: reading });
  await readingCard.getByRole("link").first().click();
  await expect(page.getByRole("listitem").filter({ hasText: "Wat gebeurt er?" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the journal" }).click();

  const fill = `${prefix} ik … hier`;
  await openComposer();
  await page.getByRole("combobox", { name: "Post type" }).click();
  await page.getByRole("option", { name: "Fill in the blanks" }).click();
  await page.getByLabel("Prompt").fill(fill);
  await page.getByLabel("Expected answer for blank 1").fill("woon");
  await page.getByRole("button", { name: "Publish post" }).click();
  const fillCard = page.locator("article").filter({ hasText: fill });
  await expect(fillCard).toBeVisible();

  await fillCard.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Prompt").fill(`${prefix} wij … hier`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(`${prefix} wij … hier`)).toBeVisible();
  const editedCard = page.locator("article").filter({ hasText: `${prefix} wij … hier` });
  await editedCard.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`${prefix} wij … hier`)).toBeHidden();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "My profile" }).click();
  await expect(page.getByText(sentence)).toBeVisible();
  await expect(page.getByText(question)).toBeVisible();
});
