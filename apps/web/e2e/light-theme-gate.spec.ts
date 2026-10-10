import { expect, test } from "@playwright/test";

const viewports = [
  { name: "narrow", width: 390, height: 844 },
  { name: "breakpoint", width: 768, height: 900 },
  { name: "wide", width: 1440, height: 1000 },
] as const;

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))).toEqual(await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.clientWidth,
  })));
}

test("light-theme motion and decoration use the approved runtime contracts", async ({ page }) => {
  await page.goto("/ui");
  await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();

  const audit = await page.evaluate(() => {
    const ruleText: string[] = [];
    const keyframeProperties: string[] = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        ruleText.push(rule.cssText);
        if (rule instanceof CSSKeyframesRule && ["wordinator-enter", "wordinator-enter-soft", "staggerIn", "loading"].includes(rule.name)) {
          for (const frame of rule.cssRules) {
            for (const property of frame.style) keyframeProperties.push(property);
          }
        }
        if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    // Audit first-party styles only: Mantine and BlockNote ship their own easing that the app does not author.
    const vendor = (sheet: CSSStyleSheet) => /\/node_modules\//.test((sheet.ownerNode as Element | null)?.getAttribute?.("data-vite-dev-id") ?? sheet.href ?? "");
    for (const sheet of document.styleSheets) if (!vendor(sheet)) visit(sheet.cssRules);

    const blurred = [...document.querySelectorAll<HTMLElement>("*")]
      .filter((element) => getComputedStyle(element).backdropFilter !== "none")
      .map((element) => getComputedStyle(element).position);
    const lineStrokes = [...document.querySelectorAll<SVGElement>("svg")]
      .filter((icon) => /(?:lineIcon|shellIcon)/.test(icon.getAttribute("class") ?? ""))
      .map((icon) => getComputedStyle(icon).strokeWidth)
      .filter((stroke) => stroke !== "0px");

    return { blurred, keyframeProperties, lineStrokes, ruleText: ruleText.join("\n") };
  });

  expect(audit.ruleText).not.toMatch(/ease-in-out|transition(?:-property)?:\s*all/i);
  expect(audit.keyframeProperties.every((property) => ["opacity", "transform"].includes(property))).toBe(true);
  expect(audit.blurred.every((position) => position === "fixed" || position === "sticky")).toBe(true);
  expect(audit.lineStrokes.length).toBeGreaterThan(0);
  expect(audit.lineStrokes.every((stroke) => stroke === "1.25px")).toBe(true);
});

test("390px, 768px, and 1440px layouts contain long localized and authored content", async ({ page }) => {
  await page.goto("/ui");
  const longLabel = "Extremely descriptive localized control label ".repeat(6);
  const authored = `https://example.test/${"ononderbrokenlangwoord".repeat(40)}`;
  await page.getByRole("button", { name: "Primary", exact: true }).first().evaluate((node, label) => { node.textContent = label; }, longLabel);
  await page.getByText("A deliberatelylongunbrokenwordthatmustwrap", { exact: false }).evaluate((node, text) => { node.textContent = text; }, authored);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalOverflow(page);
  }
});

test("stable light-theme visual baselines", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Chromium owns the deterministic pixel baselines; WebKit runs the structural gate.");

  for (const viewport of [viewports[0], viewports[2]]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Practise what you need." })).toBeVisible();
    await expect(page).toHaveScreenshot(`light-auth-${viewport.name}.png`, { animations: "disabled", fullPage: true });
  }

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/ui");
    await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();
    await expect(page).toHaveScreenshot(`light-ui-${viewport.name}.png`, { animations: "disabled", fullPage: true });
  }
});
