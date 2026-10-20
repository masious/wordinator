import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { registerAccount, uniqueTag } from "./auth";
import { courseApi, seedLesson, vocabulary } from "./lessonSeed";
import { withSeedLock } from "./speech";

test("a drill's grades show as Weak words dots, the word graded Again first", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `weak-${uniqueTag(testInfo)}`;
  await registerAccount(page, testInfo, "weakdots");
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const words = [1, 2].map((number) => ({ id: crypto.randomUUID(), term: `d${number}-${suffix}`, meaning: `meaning ${number}` }));
  const lessonId = await seedLesson(page, course.id, `${suffix} lesson`, [vocabulary(...words)]);
  for (const word of words) await api(`/courses/${course.id}/lessons/${lessonId}/words/${word.id}/bookmark`, {}, "PUT");

  await page.goto("/words");
  await page.getByRole("button", { name: "Drill", exact: true }).click();
  const setup = page.getByRole("dialog", { name: "Drill words" });
  await setup.getByRole("radio", { name: "Understand Dutch" }).check();
  await setup.getByRole("button", { name: "Start" }).click();
  // d1 is graded Again on its first showing and Got it when it comes back; d2 Got it.
  const card = page.getByRole("article", { name: "Drill card" });
  let missed = false;
  for (let step = 0; step < 10; step += 1) {
    const done = page.getByRole("region", { name: "Session done" });
    const showAnswer = card.getByRole("button", { name: "Show answer" });
    await expect(done.or(showAnswer)).toBeVisible();
    if (await done.isVisible()) break;
    await showAnswer.click();
    const again = !missed && (await card.textContent() ?? "").includes(`d1-${suffix}`);
    missed ||= again;
    await card.getByRole("button", { name: again ? "Again" : "Got it" }).click();
  }
  await expect(page.getByRole("region", { name: "Session done" })).toBeVisible();

  await page.goto("/words");
  await page.getByRole("group", { name: "Show" }).getByText("Weak words", { exact: true }).click();
  const list = page.getByRole("list", { name: "Weak words" });
  await expect(list.getByRole("listitem").first()).toHaveAccessibleName(`d1-${suffix}`);
  await expect(list.getByRole("listitem", { name: `d1-${suffix}` }).getByRole("img", { name: "Last result: Again" })).toBeVisible();
  await expect(list.getByRole("listitem", { name: `d2-${suffix}` }).getByRole("img", { name: "Last result: Got it" })).toBeVisible();
});

test("analytics opens for the superuser only", async ({ page }, testInfo) => {
  await registerAccount(page, testInfo, "ordinary");
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Analytics is not available" })).toBeVisible();
  expect((await page.request.get("/api/admin/analytics/ai?days=7")).status()).toBe(403);
  expect((await page.request.get("/api/admin/ai-settings")).status()).toBe(403);

  // Only the operator command grants the flag; the test writes it directly.
  await registerAccount(page, testInfo, "superuser");
  const email = `superuser-${uniqueTag(testInfo)}@e2e.test`;
  await withSeedLock(() => execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "wordinator", "--local", "--persist-to", "../../.wrangler/e2e", "--command",
    `UPDATE users SET is_superuser = 1 WHERE normalized_email = '${email}';`], { cwd: resolve(import.meta.dirname, "../../api"), stdio: "ignore", timeout: 30_000 }));
  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Analytics is not available" })).toHaveCount(0);
  expect((await page.request.get("/api/admin/analytics/ai?days=7")).status()).toBe(200);
});
