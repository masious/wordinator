import { expect, test, type Page } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, paragraph, seedLesson } from "./lessonSeed";

async function signIn(page: Page) {
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
}

const saved = (page: Page) => expect(page.getByRole("region", { name: "Lesson saving and publishing" }).getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });
// Puts the caret at the end of the editor paragraph holding `text` and types. macOS has no End key for line ends, and a
// click right after the editor re-renders can lose the key press, so the caret position is checked before typing.
const lineEnd = process.platform === "darwin" ? "Meta+ArrowRight" : "End";
async function append(page: Page, text: string, addition: string) {
  const target = page.locator(".bn-editor .bn-inline-content").filter({ hasText: text });
  await expect(async () => {
    await target.click();
    await page.keyboard.press(lineEnd);
    expect(await target.evaluate((node) => {
      const caret = getSelection()!.getRangeAt(0);
      const before = document.createRange(); before.selectNodeContents(node); before.setEnd(caret.endContainer, caret.endOffset);
      return before.toString().length === node.textContent!.length;
    })).toBe(true);
  }).toPass({ timeout: 5_000 });
  await page.keyboard.type(addition);
}

test("two editors of the same lesson merge by block and choose when both changed one block", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `merge-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  const first = await (await browser.newContext()).newPage();
  const second = await (await browser.newContext()).newPage();
  await signIn(first); await signIn(second);
  const api = courseApi(first);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Samen schrijven" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const lessonId = await seedLesson(first, course.id, `${suffix} lesson`, [paragraph("Eerste zin."), paragraph("Tweede zin.")], { publish: false });

  for (const page of [first, second]) {
    await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
    await page.getByRole("button", { name: "Edit lesson 1" }).click();
    await expect(page.locator(".bn-editor").getByText("Tweede zin.")).toBeVisible();
  }

  // Different blocks: the second editor's stale save merges into the first editor's version without asking.
  await append(first, "Eerste zin.", " Een.");
  await saved(first);
  await append(second, "Tweede zin.", " Twee.");
  await expect(second.getByText("Someone saved a newer version. Your edits were merged into it.")).toBeVisible({ timeout: 10_000 });
  await saved(second);
  await expect(second.locator(".bn-editor")).toContainText("Eerste zin. Een.");
  await expect(second.locator(".bn-editor")).toContainText("Tweede zin. Twee.");

  // The same block: the first editor merges cleanly again, then the second editor is asked and keeps its own edit.
  await append(first, "Eerste zin. Een.", " Drie.");
  await saved(first);
  await append(second, "Eerste zin. Een.", " Vier.");
  const choice = second.getByTestId("merge-conflict");
  await expect(choice).toBeVisible({ timeout: 10_000 });
  await expect(choice.locator("figure").filter({ hasText: "Newer version" })).toContainText("Eerste zin. Een. Drie.");
  await expect(choice.locator("figure").filter({ hasText: "Your edit" })).toContainText("Eerste zin. Een. Vier.");
  await choice.getByRole("button", { name: "Keep my edit" }).click();
  await expect(choice).toHaveCount(0);
  await saved(second);

  const { lesson } = await api<{ lesson: { draft: { document: { blocks: Array<{ content: Array<{ text: string }> }> } } } }>(`/courses/${course.id}/lessons/${lessonId}`);
  const texts = lesson.draft.document.blocks.map((block) => block.content.map((item) => item.text).join("")).filter(Boolean);
  expect(texts).toEqual(["Eerste zin. Een. Vier.", "Tweede zin. Twee."]);
});
