import { expect, type Locator, type Page } from "@playwright/test";

// macOS has no End key for line ends, and a click right after the editor re-renders can lose the key press (or land mid-text
// under load), so the caret position is checked before anything is typed.
const lineEnd = process.platform === "darwin" ? "Meta+ArrowRight" : "End";

// Puts the caret at the end of an editor block's inline content.
export async function caretToEnd(page: Page, target: Locator) {
  await expect(async () => {
    await target.click();
    await page.keyboard.press(lineEnd);
    expect(await target.evaluate((node) => {
      const caret = getSelection()!.getRangeAt(0);
      const before = document.createRange(); before.selectNodeContents(node); before.setEnd(caret.endContainer, caret.endOffset);
      return node.contains(caret.endContainer) && before.toString().length === node.textContent!.length;
    })).toBe(true);
  }).toPass({ timeout: 5_000 });
}
