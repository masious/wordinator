import { expect, test } from "@playwright/test";
import { E2E_CREATOR_EMAIL, E2E_GROUP_ID, E2E_PASSWORD } from "./global-setup";
import { courseApi, dialogue, example, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// The learner journey seeds its lessons through the API like the other course specs; authoring words is covered below.
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

test("an author adds new words in the editor, fixes an empty meaning, and publishes them", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `words-editor-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await page.goto("/"); await page.getByLabel("Email").fill(E2E_CREATOR_EMAIL); await page.getByRole("textbox", { name: "Password" }).fill(E2E_PASSWORD); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Alpha Journal" })).toBeVisible();
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [example("Ik koop een kaartje.", "I buy a ticket.")], { publish: false });

  await page.goto(`/groups/${E2E_GROUP_ID}/courses/${course.id}`);
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  await page.locator('.bn-editor [data-content-type="example"] .bn-inline-content').first().click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await page.keyboard.type("/words");
  await page.getByRole("option", { name: /^New words\b/ }).first().click();
  const block = page.getByRole("region", { name: "New words" });
  await block.getByLabel(/^Word 1 meaning/).fill("the ticket");
  await block.getByLabel(/^Word 1( \*)?$/).fill("het kaartje");
  await block.getByRole("button", { name: "Forms, example, and note for word 1" }).click();
  await block.getByLabel("Word 1 forms").fill("de kaartjes");
  await block.getByRole("button", { name: "Add word" }).click();
  await block.getByLabel(/^Word 2( \*)?$/).fill("kopen");

  const bar = page.getByRole("region", { name: "Lesson saving and publishing" });
  await expect(bar.getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });
  await bar.getByRole("button", { name: "Publish lesson" }).click();
  await bar.getByRole("button", { name: "A new word needs both the word and its meaning." }).click();
  await expect(block.getByLabel(/^Word 2 meaning/)).toBeFocused();
  await page.keyboard.type("to buy");
  await expect(bar.getByRole("status").first()).toHaveText("Saved", { timeout: 10_000 });
  await bar.getByRole("button", { name: "Publish lesson" }).click();
  await expect(bar.getByText("Unpublished", { exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Done editing" }).click();

  const words = page.getByRole("region", { name: "New words" });
  await expect(words).toContainText("het kaartje");
  await expect(words).toContainText("de kaartjes");
  await expect(words).toContainText("to buy");
});
