import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, dialogue, example, heading, openLesson, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// Lesson activities (docs/lesson-activities.md) on a lesson with a story section (one dialogue, Sofia speaks twice) and a grammar
// section. The model is the stub provider (aiStub.ts); microphone recognition is blocked in the role-play test. Block IDs are read
// back from the seeded blocks, since sections are named by their heading's block ID in URLs and in the lesson's anchors.
const STORY = "Story: Sofia at the café";
const GRAMMAR = "Grammar: de and het";
const DIALOGUE = [
  { speaker: "Anna", text: "Hallo! Ik ben Anna." },
  { speaker: "Sofia", text: "Hoi, ik ben Sofia." },
  { speaker: "Anna", text: "Leuk je te ontmoeten." },
  { speaker: "Sofia", text: "Ook leuk, dank je." },
  { speaker: "Anna", text: "Tot ziens!" },
];

async function seedActivityLesson(page: Page, testInfo: TestInfo) {
  const suffix = `activity-${uniqueTag(testInfo)}`;
  await signIn(page);
  const api = courseApi(page);
  const { course } = await api<{ course: { id: string } }>("/courses", { title: `${suffix} course`, summary: "Oefenen" });
  await api(`/courses/${course.id}/visibility`, { status: "published" });
  const story = heading(STORY);
  const grammar = heading(GRAMMAR);
  // The grammar section is long enough that its heading can reach the top of the window with text still below it, so the page never
  // reaches its bottom (where the lesson-end activity takes over).
  const filler = Array.from({ length: 14 }, (_, index) => paragraph(`Oefentekst ${index + 1}: deze zin maakt de pagina langer, zodat er genoeg tekst onder de kop staat.`));
  await seedLesson(page, course.id, `${suffix} lesson`, [
    story,
    paragraph("Sofia zit in een café in Utrecht. Ze wil koffie bestellen en daarna de weg naar het station vragen."),
    paragraph("Een vriendelijke vreemde wijst haar de weg. Het gesprek is kort en beleefd."),
    dialogue(DIALOGUE),
    grammar,
    example("Het huis is groot.", "The house is big."),
    // Wide screens keep a lesson's actions in the New words panel's footer, and that panel exists only when the lesson has words.
    vocabulary({ term: "het huis", meaning: "the house", example: "Het huis is groot." }),
    ...filler,
  ]);
  return { courseId: course.id, story: story.id, grammar: grammar.id };
}

// Scrolls a section's heading to the top of the window, as reading does, so the reading line is inside that section.
async function readTo(page: Page, blockId: string) {
  await page.locator(`[data-block-id="${blockId}"]`).first().evaluate((element) => element.scrollIntoView({ block: "start" }));
}

test("scrolling from the story section to the grammar section swaps the suggested activities, and scrolling back restores them", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId, story, grammar } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();

  await readTo(page, story);
  await expect(actions.getByRole("link", { name: "Story summary", exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: `Story comprehension · ${STORY}`, exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: `Dialogue role-play · Dialogue · ${STORY}`, exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Grammar explanation" })).toHaveCount(0);

  await readTo(page, grammar);
  await expect(actions.getByRole("link", { name: "Grammar explanation", exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: `Quick grammar question · ${GRAMMAR}`, exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: `Tricky grammar practice · ${GRAMMAR}`, exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Story summary" })).toHaveCount(0);

  await readTo(page, story);
  await expect(actions.getByRole("link", { name: "Story summary", exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Grammar explanation" })).toHaveCount(0);
});

test("a quick grammar question opens on its own page with a link back to its section, and Back to lesson returns to that section", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId, grammar } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, grammar);
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();

  await actions.getByRole("link", { name: `Quick grammar question · ${GRAMMAR}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/activities/${grammar}/quick_grammar$`));
  const back = page.getByRole("link", { name: `Back to ${GRAMMAR}`, exact: true });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", new RegExp(`#${grammar}$`));
  await expect(page.getByRole("heading", { name: "Quick grammar question", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "het", exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity complete", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "Back to lesson", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/[^/]+#${grammar}$`));
  await expect(page.locator(`[data-block-id="${grammar}"]`).first()).toBeInViewport();
});

test("reloading a tricky grammar page resumes at the question reached, and so does opening its address again", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId, grammar } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, grammar);
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();

  await actions.getByRole("link", { name: `Tricky grammar practice · ${GRAMMAR}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tricky grammar practice", level: 1 })).toBeVisible();
  const address = page.url();
  await page.getByRole("button", { name: "het", exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Question 2 of 4" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("progressbar", { name: "Question 2 of 4" })).toBeVisible();
  await expect(page.getByText("Ik ___ naar school.", { exact: true })).toBeVisible();

  await page.goto(address);
  await expect(page.getByRole("progressbar", { name: "Question 2 of 4" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Back to ${GRAMMAR}`, exact: true })).toBeVisible();
});

test("a role-play dialogue with a blocked microphone takes typed replies through Send, Continue and Finish", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  // A blocked microphone: no browser recognizer, and getUserMedia refuses. Holding the control reports it; typing still works.
  await page.addInitScript(() => {
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, name, { value: undefined, configurable: true });
    if (navigator.mediaDevices) {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(new DOMException("Blocked", "NotAllowedError")), configurable: true });
    }
  });
  const { courseId, story } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, story);
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();
  await actions.getByRole("link", { name: `Dialogue role-play · Dialogue · ${STORY}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dialogue role-play", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Start dialogue", exact: true }).click();
  await expect(page.getByText("Hallo! Ik ben Anna.", { exact: true })).toBeVisible();
  const reply = page.getByRole("textbox", { name: "Your reply" });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const hold = page.getByRole("button", { name: "Hold to speak", exact: true });
  await expect(hold).toBeEnabled();
  // The hold reports the blocked microphone while held; releasing it does not send anything.
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByText("The microphone is blocked. Allow it in the browser, or type your reply.", { exact: true })).toBeVisible();
  await page.mouse.up();
  await expect(send).toBeDisabled();

  await reply.fill("Hoi, ik ben Sofia.");
  await send.click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(page.getByText("Leuk je te ontmoeten.", { exact: true })).toBeVisible();
  await reply.fill("Ook leuk, dank je.");
  await send.click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity complete", level: 2 })).toBeVisible();

  await page.getByRole("button", { name: "Back to lesson", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/[^/]+#${story}$`));
  await expect(page.locator(`[data-block-id="${story}"]`).first()).toBeInViewport();
});
