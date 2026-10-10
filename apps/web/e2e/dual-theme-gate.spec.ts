import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_PASSWORD } from "./global-setup";

const storageKey = "wordinator:color-scheme";
const viewports = [
  { name: "narrow", width: 390, height: 844 },
  { name: "wide", width: 1440, height: 1000 },
] as const;

async function setPreference(page: import("@playwright/test").Page, scheme: "light" | "dark") {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [storageKey, scheme]);
}

async function expectScheme(page: import("@playwright/test").Page, scheme: "light" | "dark") {
  await expect(page.locator("html")).toHaveAttribute("data-mantine-color-scheme", scheme);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", scheme === "dark" ? "#1c1715" : "#f5ede2");
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe(scheme);
}

async function expectNoOverflow(page: import("@playwright/test").Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test("system resolves before application startup and follows operating-system changes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/ui");
  await expectScheme(page, "dark");
  await expect(page.getByRole("radio", { name: "System" }).first()).toBeChecked();

  await page.emulateMedia({ colorScheme: "light" });
  await expectScheme(page, "light");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("explicit preference is accessible, persists on refresh, and synchronizes chrome", async ({ page }) => {
  await page.goto("/ui");
  const preference = page.getByRole("radiogroup", { name: "Theme preference" }).first();
  await preference.getByText("Dark", { exact: true }).click();
  await expectScheme(page, "dark");
  await page.reload();
  await expectScheme(page, "dark");
  await expect(page.getByRole("radio", { name: "Dark" }).first()).toBeChecked();

  await page.request.post("/api/auth/sign-in", { data: { email: E2E_CREATOR_EMAIL, password: E2E_PASSWORD } });
  await page.goto("/settings");
  await expect(page.getByRole("radiogroup", { name: "Theme preference" })).toBeVisible();
  await expect(page.getByText("Dark preference · currently Dark")).toBeVisible();
});

test("production routes, previews, media, and overlays remain contained in both schemes", async ({ page }) => {
  await page.goto("/ui");
  await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();
  await page.request.post("/api/auth/sign-in", { data: { email: E2E_CREATOR_EMAIL, password: E2E_PASSWORD } });
  const routes = [
    "/journal",
    "/notifications",
    "/courses",
    "/words",
    "/settings",
    "/ui",
  ];

  for (const scheme of ["light", "dark"] as const) {
    await setPreference(page, scheme);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expectScheme(page, scheme);
        await expectNoOverflow(page);
      }
    }

    await page.setViewportSize(viewports[1]);
    await page.goto("/ui");
    await expect(page.locator('[data-theme-preview="light"]')).toBeVisible();
    await expect(page.locator('[data-theme-preview="dark"]')).toBeVisible();
    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog", { name: "Adaptive dialog" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit example" })).toBeVisible();
    await expectNoOverflow(page);
  }
});

test("semantic contrast, focus, forced colors, and media treatment remain safe", async ({ page }) => {
  await page.goto("/ui");
  await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();

  for (const scheme of ["light", "dark"] as const) {
    await setPreference(page, scheme);
    await page.goto(`/ui?contrast=${scheme}`, { waitUntil: "networkidle" });
    const ratios = await page.evaluate(() => {
      const contrast = (foreground: string, background: string) => {
        const parse = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
        const luminance = (value: string) => {
          const [red, green, blue] = parse(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const first = luminance(foreground);
        const second = luminance(background);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
      };
      const resolved = (foreground: string, background: string) => {
        const sample = document.createElement("span");
        sample.style.color = `var(${foreground})`;
        sample.style.backgroundColor = `var(${background})`;
        document.body.append(sample);
        const styles = getComputedStyle(sample);
        const ratio = contrast(styles.color, styles.backgroundColor);
        sample.remove();
        return ratio;
      };
      return {
        body: resolved("--color-foreground", "--color-page"),
        muted: resolved("--color-foreground-muted", "--color-page"),
        action: resolved("--color-action-text", "--color-action"),
        danger: resolved("--color-danger-text", "--color-danger-surface"),
        selected: resolved("--color-foreground", "--color-selected"),
        focus: resolved("--color-focus", "--color-page"),
      };
    });
    expect(ratios.body).toBeGreaterThanOrEqual(4.5);
    expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
    expect(ratios.action).toBeGreaterThanOrEqual(4.5);
    expect(ratios.danger).toBeGreaterThanOrEqual(4.5);
    expect(ratios.selected).toBeGreaterThanOrEqual(4.5);
    expect(ratios.focus).toBeGreaterThanOrEqual(3);
  }

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/ui?forced-colors=active", { waitUntil: "networkidle" });
  const primary = page.getByRole("button", { name: "Primary", exact: true }).first();
  await primary.focus();
  await expect(primary).toBeFocused();
  expect(await primary.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  expect(await page.evaluate(() => getComputedStyle(document.body, "::before").display)).toBe("none");
  expect(await page.locator("img").evaluateAll((images) => images.every((image) => getComputedStyle(image).filter === "none"))).toBe(true);
});

test("stable dual-theme visual baselines", async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Chromium owns deterministic pixels; WebKit runs the structural dual-theme gate.");
  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const scheme of ["light", "dark"] as const) {
    await page.goto("/");
    await setPreference(page, scheme);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto("/ui");
      await expect(page.getByRole("heading", { name: "Wordinator UI workbench" })).toBeVisible();
      await expect(page).toHaveScreenshot(`${scheme}-dual-ui-${viewport.name}.png`, { animations: "disabled", fullPage: true });
    }
  }
});
