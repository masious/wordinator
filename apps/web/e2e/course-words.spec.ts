import { expect, test } from "@playwright/test";
import { E2E_GROUP_ID } from "./global-setup";
import { signIn } from "./auth";
import { courseApi, dialogue, example, paragraph, seedLesson, vocabulary, openLesson } from "./lessonSeed";
import { expectRecapFits, finishRecap, pageToWord } from "./wordRecap";

// The learner journey seeds its lessons through the API like the other course specs; authoring words is covered below.
test("a learner sees new words on the steps that introduce them and reviews them after finishing", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `words-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await signIn(page);

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

  await page.goto(`/courses/${course.id}`);
  await expect(page.getByRole("button", { name: "Review words" })).toHaveCount(0);
  // The lesson page lists the lesson's words beside the text instead of showing vocabulary blocks in place.
  await openLesson(page);
  await expect(page.getByRole("complementary", { name: "New words" })).toContainText("het kaartje");
  await expect(page.getByRole("region", { name: "New words" })).toHaveCount(0);
  await page.getByRole("link", { name: /^Back to / }).click();

  await page.getByRole("button", { name: "Start lesson 1" }).click();
  const player = page.getByRole("dialog");
  const panel = player.getByRole("region", { name: "New words" });
  await expect(player.getByText("Step 1 of 4")).toBeVisible();
  await expect(panel).toContainText("het kaartje");
  await expect(panel.getByText("Diminutive of de kaart.")).toHaveCount(0);
  await panel.getByRole("button", { name: "Show more about het kaartje" }).click();
  await expect(panel).toContainText("Diminutive of de kaart.");
  // Words can be bookmarked from the panel before the lesson is finished.
  const ticketBookmark = panel.getByRole("button", { name: "Bookmark het kaartje" });
  await expect(ticketBookmark).toHaveAttribute("aria-pressed", "false");
  await ticketBookmark.click();
  await expect(ticketBookmark).toHaveAttribute("aria-pressed", "true");
  // A dialogue's word shows on the first line that uses it, not before.
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Waar is de trein?", { exact: true })).toBeVisible();
  await expect(panel).toHaveCount(0);
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Op spoor twee.", { exact: true })).toBeVisible();
  await expect(panel).toContainText("het spoor");
  await player.getByRole("button", { name: "Next" }).click();
  await expect(player.getByText("Tot ziens!")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await player.getByRole("button", { name: "Finish lesson" }).click();

  await expect(player.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await player.getByRole("button", { name: "Review words" }).click();
  await expect(player.getByText(/^Words? 1\b.* of 2$/)).toBeVisible();
  const ticket = player.getByRole("article", { name: "het kaartje" });
  await expect(ticket).toContainText("de kaartjes");
  await expect(player.getByText("the ticket")).toHaveCount(0);
  await ticket.getByRole("button", { name: "Show meaning" }).click();
  await expect(ticket.getByText("the ticket")).toBeVisible();
  // The recap card shows the bookmark made in the panel.
  await expect(ticket.getByRole("button", { name: "Bookmark het kaartje" })).toHaveAttribute("aria-pressed", "true");
  await expectRecapFits(page, "lesson word recap");
  await finishRecap(player, "Back to the summary");
  await player.getByRole("button", { name: "Back to the course" }).click();

  // The course recap covers the finished lesson only.
  await expect(page.getByText("2 words from the lessons you have finished.")).toBeVisible();
  await page.getByRole("button", { name: "Review words" }).click();
  const recap = page.getByRole("dialog", { name: "Review words" });
  await expect(recap.getByRole("article", { name: "het kaartje" })).toBeVisible();
  const track = await pageToWord(recap, "het spoor");
  await track.getByRole("button", { name: "Bookmark het spoor" }).click();
  await expect(track.getByRole("button", { name: "Bookmark het spoor" })).toHaveAttribute("aria-pressed", "true");
  await expect(recap.getByText("de bus")).toHaveCount(0);
  await finishRecap(recap, "Back to the course");
  await expect(recap).toHaveCount(0);
  // Both browsers share the seeded account, so only this course's bookmarks are compared.
  const bookmarks = await (await page.request.get(`/api/groups/${E2E_GROUP_ID}/word-bookmarks`)).json() as { items: Array<{ word: { term: string }; course: { id: string } }> };
  expect(bookmarks.items.filter((item) => item.course.id === course.id).map((item) => item.word.term)).toEqual(["het spoor", "het kaartje"]);
});

test("an author adds new words in the editor, fixes an empty meaning, and publishes them", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const suffix = `words-editor-${testInfo.project.name.replaceAll(/[^a-z]/g, "")}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Woorden" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  await seedLesson(page, course.id, `${suffix} lesson`, [example("Ik koop een kaartje.", "I buy a ticket.")], { publish: false });

  await page.goto(`/courses/${course.id}`);
  await openLesson(page);
  await page.getByRole("button", { name: "Edit lesson 1" }).click();
  await page.locator('.bn-editor [data-content-type="example"] .bn-inline-content').first().click();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await page.keyboard.type("/words");
  await page.getByRole("option", { name: /^New words\b/ }).first().click();
  const block = page.getByRole("region", { name: "New words" });
  await block.getByLabel(/^Word 1 meaning/).fill("the ticket");
  await block.getByLabel(/^Word 1( \*)?$/).fill("het kaartje");
  await block.getByRole("button", { name: "Forms, example, note, and pronunciation for word 1" }).click();
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

  const words = page.getByRole("complementary", { name: "New words" });
  await expect(words).toContainText("het kaartje");
  await expect(words).toContainText("de kaartjes");
  await expect(words).toContainText("to buy");
});
