import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, openLesson, practice, seedLesson } from "./lessonSeed";

test("a learner answers a practice and reveals the thread with the author's version", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `practice-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  // Course content is authored through the API with the signed-in session; the journey under test is practising.
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Mijn huis" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [practice("Vul in of vertaal.", [
    { prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "Eén keuken." }, { prompt: "There are two bedrooms.", authorsVersion: ["Er zijn twee slaapkamers."] },
  ])]);

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  await openLesson(page);
  // The lesson page lists the prompts; answering happens in a dialog.
  await expect(page.getByText("Vul in of vertaal.")).toBeVisible();
  await expect(page.getByText("There are two bedrooms.")).toBeVisible();
  await expect(page.getByText("Not answered yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish answer set" })).toHaveCount(0);
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Answer the practice" });
  await expect(dialog.getByText("0 answers are concealed")).toBeVisible();
  await expect(dialog.getByText("Er zijn twee slaapkamers.")).toHaveCount(0);
  await dialog.getByLabel(/^1\. … een kleine keuken\./).fill("Er is");
  await dialog.getByRole("button", { name: "Publish answer set" }).click();

  const thread = page.getByRole("region", { name: "Practice answers" });
  await expect(thread.getByText("Er zijn twee slaapkamers.")).toBeVisible();
  await expect(thread.getByText("Eén keuken.")).toBeVisible();
  const answer = thread.locator("article").filter({ hasText: "No answer" });
  await expect(answer).toBeVisible();
  await answer.getByRole("button", { name: "Reply" }).click(); await answer.getByLabel("Reply").fill("Goed geprobeerd!"); await answer.getByRole("button", { name: "Publish reply" }).click();
  await expect(thread.getByText("Goed geprobeerd!")).toBeVisible();

  // A new visit starts concealed again.
  await page.reload();
  await page.getByRole("button", { name: "Answer", exact: true }).click();
  await expect(dialog.getByText("2 answers are concealed")).toBeVisible();
  await dialog.getByRole("button", { name: "Reveal answers" }).click();
  await expect(page.getByText("Goed geprobeerd!")).toBeVisible();
});
