import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { signIn, uniqueTag } from "./auth";
import { courseApi, dialogue, example, heading, openLesson, paragraph, seedLesson, vocabulary } from "./lessonSeed";

// Lesson activities (docs/lesson-activities.md) on a lesson with a story section (its words and one dialogue, Sofia speaks twice) and
// a grammar section. The model is the stub provider (aiStub.ts); microphone recognition is blocked in the read-aloud test. Block IDs are read
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
  // The grammar section is long enough that its heading can reach the top of the window with text still below it.
  const filler = Array.from({ length: 14 }, (_, index) => paragraph(`Oefentekst ${index + 1}: deze zin maakt de pagina langer, zodat er genoeg tekst onder de kop staat.`));
  await seedLesson(page, course.id, `${suffix} lesson`, [
    story,
    paragraph("Sofia zit in een café in Utrecht. Ze wil koffie bestellen en daarna de weg naar het station vragen."),
    paragraph("Een vriendelijke vreemde wijst haar de weg. Het gesprek is kort en beleefd."),
    dialogue(DIALOGUE),
    vocabulary({ term: "het café", meaning: "the café", example: "Sofia zit in een café." }, { term: "de weg", meaning: "the way", example: "Ze vraagt de weg." }),
    grammar,
    example("Het huis is groot.", "The house is big."),
    vocabulary({ term: "het huis", meaning: "the house", example: "Het huis is groot." }),
    ...filler,
  ]);
  return { courseId: course.id, story: story.id, grammar: grammar.id };
}

// Scrolls a section's heading to the top of the window, as reading does, so the reading line is inside that section.
async function readTo(page: Page, blockId: string) {
  await page.locator(`[data-block-id="${blockId}"]`).first().evaluate((element) => element.scrollIntoView({ block: "start" }));
}

// A section's activity in the text: each section's activities sit on a Do more with AI card after its last block, every link
// named by its type and its source (docs/lesson-activities.md#in-the-text).
const activity = (page: Page, name: string) => page.getByRole("complementary", { name: "Do more with AI" }).getByRole("link", { name, exact: true });

test("each section's activities sit in the text after it, and the lesson's actions offer only Practise words", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  const cards = page.getByRole("complementary", { name: "Do more with AI" });
  // A dialogue section offers only read aloud; the grammar section leads with guided grammar.
  await expect(cards.nth(0).getByRole("link")).toHaveCount(1);
  await expect(cards.nth(0).getByRole("link", { name: `Read aloud · ${STORY}`, exact: true })).toBeVisible();
  await expect(activity(page, `Guided grammar · ${GRAMMAR}`)).toBeVisible();
  await expect(activity(page, `Tricky grammar practice · ${GRAMMAR}`)).toBeVisible();
  // Story summary, speak from English, role-play, grammar explanation and review words are retired.
  await expect(cards.getByRole("link", { name: /Story summary|Speak from English|role-play|Grammar explanation|Review words/ })).toHaveCount(0);
  // The lesson's actions carry no AI activities.
  const actions = page.getByRole("group", { name: "Lesson actions" }).first();
  await expect(actions.getByRole("link")).toHaveCount(1);
  await expect(actions.getByRole("link", { name: "Practise words" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Do more with AI/ })).toHaveCount(0);
});

test("a two-step guided grammar flow advances the lesson's progress meter, shows the completion metrics, and Back to lesson returns to its section", async ({ page }, testInfo) => {
  testInfo.setTimeout(120_000);
  const { courseId, grammar } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, grammar);
  const meter = page.getByRole("progressbar", { name: "Lesson progress" });
  const before = Number(await meter.getAttribute("aria-valuenow"));

  await activity(page, `Guided grammar · ${GRAMMAR}`).click();
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

test("the lesson's word batch is a button in a Do more with AI card, whose Peek ends with Drill and Practice", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  // The lesson's few words make one batch, offered after its last section (docs/words.md#word-batches).
  const review = page.getByRole("complementary", { name: "Do more with AI" }).getByRole("button", { name: "Review batch 1 words of this lesson" });
  await expect(review).toHaveCount(1);
  await review.click();
  const peek = page.getByRole("dialog", { name: /^Batch 1 of / });
  await expect(peek.getByRole("article").first()).toBeVisible();
  while (await peek.getByRole("button", { name: "Next", exact: true }).isVisible()) await peek.getByRole("button", { name: "Next", exact: true }).click();
  await expect(peek.getByRole("button", { name: "Practice batch 1 with the tutor" })).toBeVisible();
  await peek.getByRole("button", { name: "Drill batch 1" }).click();
  await expect(page).toHaveURL(/\/words\/drill\?.*batch=1/);
});

test("reloading a tricky grammar page resumes at the question reached, and so does opening its address again", async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000);
  const { courseId, grammar } = await seedActivityLesson(page, testInfo);
  await page.goto(`/courses/${courseId}`);
  await openLesson(page);
  await readTo(page, grammar);

  await activity(page, `Tricky grammar practice · ${GRAMMAR}`).click();
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

test("read aloud as Sofia, with a blocked microphone, voices Anna and takes typed lines through Send, Continue and Finish", async ({ page }, testInfo) => {
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
  await activity(page, `Read aloud · ${STORY}`).click();
  await expect(page.getByRole("heading", { name: "Read aloud", level: 1 })).toBeVisible();

  // Whose lines: each speaker once, and All lines.
  await expect(page.getByRole("radio", { name: "Anna" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "All lines" })).toBeChecked();
  await page.getByRole("radio", { name: "Sofia" }).check();
  await page.getByRole("button", { name: "Start reading", exact: true }).click();
  // Anna's line is the app's; Sofia's line is the learner's to read.
  await expect(page.getByText("Hallo! Ik ben Anna.", { exact: true })).toBeVisible();
  await expect(page.getByText("Read this line aloud as Sofia", { exact: true })).toBeVisible();
  await expect(page.getByText("Your line 1 of 2", { exact: true })).toBeVisible();
  const reply = page.getByRole("textbox", { name: "What you said" });
  const send = page.getByRole("button", { name: "Send", exact: true });
  const hold = page.getByRole("button", { name: "Hold to speak", exact: true });
  await expect(hold).toBeEnabled();
  // The hold reports the blocked microphone while held; releasing it does not send anything.
  await hold.hover();
  await page.mouse.down();
  await expect(page.getByText("The microphone is blocked. Allow it in the browser, or type the line.", { exact: true })).toBeVisible();
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
  // Anna's closing line follows Sofia's last.
  await expect(page.getByText("Tot ziens!", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Activity complete", level: 2 })).toBeVisible();

  await page.getByRole("link", { name: "Back to lesson", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lessons/[^/]+#${story}$`));
  await expect(page.locator(`[data-block-id="${story}"]`).first()).toBeInViewport();
});
