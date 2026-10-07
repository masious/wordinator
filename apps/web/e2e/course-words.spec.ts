import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, dialogue, example, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// The editor has no New words item yet (C8c), so the lesson is authored through the API like the other course specs.
test("a learner sees new words on the steps that introduce them and reviews them after finishing", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `words-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();

  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [
    example("Ik koop een kaartje.", "I buy a ticket."),
    vocabulary({ term: "het kaartje", meaning: "the ticket", forms: "de kaartjes", note: "Diminutive of de kaart." }),
    dialogue([{ speaker: "A", text: "Waar is de trein?" }, { speaker: "B", text: "Op spoor twee." }]),
    vocabulary({ term: "het spoor", meaning: "the track", example: "De trein staat op spoor twee." }),
    paragraph("Tot ziens!"),
  ]);
  await seedLesson(page, course.id, `${suffix} unfinished`, [vocabulary({ term: "de bus", meaning: "the bus" }), example("De bus komt.")]);

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  // The reader shows each vocabulary block in place.
  await expect(page.getByRole("region", { name: "New words" }).first()).toContainText("het kaartje");
  await expect(page.getByRole("button", { name: "Review words" })).toHaveCount(0);

  await page.getByRole("button", { name: "Start lesson 1" }).click();
  const player = page.getByRole("dialog");
  const panel = player.getByRole("region", { name: "New words" });
  await expect(player.getByText("Step 1 of 4")).toBeVisible();
  await expect(panel).toContainText("het kaartje");
  await expect(panel).toContainText("Diminutive of de kaart.");
  // The dialogue's words stay visible on every line.
  for (const line of ["Waar is de trein?", "Op spoor twee."]) {
    await player.getByRole("button", { name: "Next" }).click();
    await expect(player.getByText(line, { exact: true })).toBeVisible();
    await expect(panel).toContainText("het spoor");
  }
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Tot ziens!")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await player.getByRole("button", { name: "Finish lesson" }).click();

  await expect(player.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await player.getByRole("button", { name: "Review words" }).click();
  await expect(player.getByText("Word 1 of 2")).toBeVisible();
  await expect(player.getByRole("article", { name: "het kaartje" })).toContainText("de kaartjes");
  await expect(player.getByText("the ticket")).toHaveCount(0);
  await player.getByRole("button", { name: "Show meaning" }).click();
  await expect(player.getByText("the ticket")).toBeVisible();
  await player.getByRole("button", { name: "Next" }).click();
  await player.getByRole("button", { name: "Back to the summary" }).click();
  await player.getByRole("button", { name: "Back to the course" }).click();

  // The course recap covers the finished lesson only.
  await expect(page.getByText("2 words from the lessons you have finished.")).toBeVisible();
  await page.getByRole("button", { name: "Review words" }).click();
  const recap = page.getByRole("dialog", { name: "Review words" });
  await expect(recap.getByRole("article", { name: "het kaartje" })).toBeVisible();
  await recap.getByRole("button", { name: "Next" }).click();
  await expect(recap.getByRole("article", { name: "het spoor" })).toBeVisible();
  await expect(recap.getByText("de bus")).toHaveCount(0);
  await recap.getByRole("button", { name: "Back to the course" }).click();
  await expect(recap).toHaveCount(0);
});
