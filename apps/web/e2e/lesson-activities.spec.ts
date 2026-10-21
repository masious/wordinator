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
  // uniqueTag is per project and run; tests in one project run in parallel, so the test ID keeps each seeded course (and slug) apart.
  const suffix = `activity-${uniqueTag(testInfo)}-${testInfo.testId.slice(0, 8)}`;
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
  await expect(actions.getByRole("link", { name: `Guided grammar · ${GRAMMAR}`, exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: `Tricky grammar practice · ${GRAMMAR}`, exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Story summary" })).toHaveCount(0);

  await readTo(page, story);
  await expect(actions.getByRole("link", { name: "Story summary", exact: true })).toBeVisible();
  await expect(actions.getByRole("link", { name: "Grammar explanation" })).toHaveCount(0);
});

test("a two-step guided grammar flow advances the lesson's progress meter, shows the completion metrics, and Back to lesson returns to its section", async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  const { courseId, grammar } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, grammar);
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();
  const meter = page.getByRole("progressbar", { name: "Lesson progress" });
  const before = Number(await meter.getAttribute("aria-valuenow"));

  await actions.getByRole("link", { name: `Guided grammar · ${GRAMMAR}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/activities/${grammar}/guided_grammar$`));
  const back = page.getByRole("link", { name: `Back to ${GRAMMAR}`, exact: true });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute("href", new RegExp(`#${grammar}$`));
  await expect(page.getByRole("heading", { name: "Guided grammar", level: 1 })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Guided grammar" })).toHaveAttribute("aria-valuetext", "Question 1 of 2");

  await page.getByRole("button", { name: "het", exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Guided grammar" })).toHaveAttribute("aria-valuetext", "Question 2 of 2");
  await page.getByRole("button", { name: "boeken", exact: true }).click();
  await page.getByRole("button", { name: "Check answer", exact: true }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity complete", level: 2 })).toBeVisible();
  await expect(page.getByText("Your work stays private.", { exact: true })).toBeVisible();
  const metrics = page.getByTestId("completion-metrics");
  await expect(metrics).toBeVisible();
  await expect(metrics.getByText(/\+\d+% of this lesson's grammar/)).toBeVisible();

  await page.getByRole("link", { name: "Back to lesson", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/[^/]+#${grammar}$`));
  await expect(page.locator(`[data-block-id="${grammar}"]`).first()).toBeInViewport();
  await expect(async () => {
    expect(Number(await meter.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  }).toPass();
});

test("hovering a story summary sentence highlights its pair in both columns", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId, story } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, story);
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();
  await actions.getByRole("link", { name: "Story summary", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Story summary", level: 1 })).toBeVisible();

  const first = page.locator('[data-pair="0"]');
  const second = page.locator('[data-pair="1"]');
  await expect(first).toHaveCount(2);
  await expect(first.first()).toHaveText("Sofia bestelt koffie in een café.");
  await expect(first.nth(1)).toHaveText("Sofia orders a coffee in a café.");
  await expect(first.first()).not.toHaveClass(/highlighted/);

  await first.first().hover();
  await expect(first.first()).toHaveClass(/highlighted/);
  await expect(first.nth(1)).toHaveClass(/highlighted/);
  await expect(second.first()).not.toHaveClass(/highlighted/);
  await expect(second.nth(1)).not.toHaveClass(/highlighted/);

  await second.nth(1).hover();
  await expect(second.first()).toHaveClass(/highlighted/);
  await expect(first.first()).not.toHaveClass(/highlighted/);
});

test("a read-aloud line with a blocked microphone takes a typed reply through Send, Continue and Finish", async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
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
  await actions.getByRole("link", { name: `Read aloud · ${STORY}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Read aloud", level: 1 })).toBeVisible();

  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();
  for (let guard = 0; guard < 20; guard += 1) {
    // The page may still be settling on the saved line, so the line is read once it holds still.
    const shown = page.getByText("Read this line aloud", { exact: true }).locator("xpath=following-sibling::p");
    let line = await shown.innerText();
    await page.waitForTimeout(600);
    for (let settle = 0; settle < 10 && (await shown.innerText()) !== line; settle += 1) { line = await shown.innerText(); await page.waitForTimeout(600); }
    await page.getByRole("textbox", { name: "Your reply" }).fill(line);
    await send.click();
    await expect(page.getByText("Correct", { exact: true })).toBeVisible();
    const finish = page.getByRole("button", { name: "Finish", exact: true });
    if (await finish.count()) { await finish.click(); break; }
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Activity complete", level: 2 })).toBeVisible();
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

  await page.getByRole("link", { name: "Back to lesson", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/[^/]+#${story}$`));
  await expect(page.locator(`[data-block-id="${story}"]`).first()).toBeInViewport();
});
