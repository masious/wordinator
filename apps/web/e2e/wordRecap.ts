import { expect, type Locator, type Page } from "@playwright/test";

// The recap fits as many cards as the viewport allows, so specs page to a word instead of assuming one card per page.
export async function pageToWord(recap: Locator, term: string) {
  const card = recap.getByRole("article", { name: term });
  for (let pages = 0; pages < 50 && !await card.isVisible(); pages += 1) await recap.getByRole("button", { name: "Next" }).click();
  await expect(card).toBeVisible();
  return card;
}

export async function finishRecap(recap: Locator, doneLabel: string) {
  const done = recap.getByRole("button", { name: doneLabel });
  for (let pages = 0; pages < 50 && !await done.isVisible(); pages += 1) await recap.getByRole("button", { name: "Next" }).click();
  await done.click();
}

// The dialog holding the recap must not scroll: every card of the page fits its frame.
export async function expectRecapFits(page: Page, label: string) {
  await expect.poll(
    () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".mantine-Modal-content, .mantine-Modal-inner")]
      .map((element) => element.scrollHeight - element.clientHeight).reduce((most, overflow) => Math.max(most, overflow), 0)),
    { message: `${label} must fit without scrolling` },
  ).toBeLessThanOrEqual(1);
}
