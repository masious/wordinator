import { expect, test, type Locator, type Page } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, paragraph, seedLesson, openLesson } from "./lessonSeed";
import { caretToEnd } from "./editor";

type Block = Record<string, unknown>;
const columns = (...contents: Block[][]): Block => ({
  id: crypto.randomUUID(), type: "columnList", props: {},
  children: contents.map((children) => ({ id: crypto.randomUUID(), type: "column", props: { width: 1 }, children })),
});

// Drags a block by its side-menu handle onto the right edge of another block (or column), where BlockNote makes a column.
async function dragToRightEdge(page: Page, block: Locator, target: Locator) {
  await block.hover();
  const handle = page.getByRole("button", { name: "Open block menu" });
  await expect(handle).toBeVisible();
  const from = (await handle.boundingBox())!; const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.move(to.x + to.width - 3, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}

const editorColumns = (page: Page) => page.locator('.bn-editor [data-node-type="column"]');
const saved = (page: Page) => expect(page.getByRole("region", { name: "Lesson saving and publishing" }).getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });

test("an author makes columns by slash item and by dragging, and they survive a reload", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `columns-${uniqueTag(testInfo)}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Kolommen" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [paragraph("Links."), paragraph("Rechts.")], { publish: false });

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  const editor = page.locator(".bn-editor");
  await dragToRightEdge(page, editor.getByText("Rechts."), editor.locator('[data-node-type="blockContainer"]', { hasText: "Links." }));
  await expect(editorColumns(page)).toHaveCount(2);
  await expect(editorColumns(page).nth(0)).toContainText("Links.");
  await expect(editorColumns(page).nth(1)).toContainText("Rechts.");
  await saved(page);

  // The slash item adds three empty columns below the current column list, never inside it.
  await caretToEnd(page, editor.locator(".bn-inline-content").filter({ hasText: "Links." }));
  await page.keyboard.press("Enter");
  await page.keyboard.type("/three");
  await expect(page.getByRole("option", { name: "Three columns" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(editor.locator('[data-node-type="columnList"]')).toHaveCount(2);
  await page.keyboard.type("Eerste kolom.");
  await saved(page);

  await page.reload();
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  await expect(editor.locator('[data-node-type="columnList"]')).toHaveCount(2);
  await expect(editorColumns(page)).toHaveCount(5);
  await expect(editorColumns(page).nth(2)).toContainText("Eerste kolom.");
  await expect(editor.locator('[data-node-type="columnList"]').first().locator('[data-node-type="column"]').nth(1)).toContainText("Rechts.");
});

test("the editor refuses a fourth column and readers see the published columns", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const suffix = `fourth-${uniqueTag(testInfo)}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Kolommen" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [paragraph("Vier."), columns([paragraph("Een.")], [paragraph("Twee.")], [paragraph("Drie.")])], { publish: false });

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  const editor = page.locator(".bn-editor");
  await expect(editorColumns(page)).toHaveCount(3);
  await dragToRightEdge(page, editor.getByText("Vier."), editorColumns(page).nth(2));
  await expect(editorColumns(page)).toHaveCount(3);
  // A refused drop leaves the block where it was; a repaired fourth column would have moved it below the columns.
  await expect(editor.locator('[data-node-type="blockGroup"]').first().locator("> *").first()).toHaveText("Vier.");
  await saved(page);

  const bar = page.getByRole("region", { name: "Lesson saving and publishing" });
  await bar.getByRole("button", { name: "Publish lesson" }).click();
  await expect(bar.getByText("Unpublished", { exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Done editing" }).click();
  const een = page.getByText("Een.", { exact: true }); const twee = page.getByText("Twee.", { exact: true });
  await expect(een).toBeVisible();
  // Wide screens show the columns side by side.
  expect((await twee.boundingBox())!.x).toBeGreaterThan((await een.boundingBox())!.x + 50);
});
