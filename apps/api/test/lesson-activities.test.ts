import { env } from "cloudflare:test";
import { DEFAULT_AI_SETTINGS } from "@wordinator/contracts/ai";
import {
  activityAnswerResponseSchema, activityDescriptorListResponseSchema, activityOpenResponseSchema, activityRunPatchResponseSchema,
  activitySpeechResponseSchema, activityStatusResponseSchema, lessonActivityPayloadSchema, type ActivityDescriptor, type ActivityType,
} from "@wordinator/contracts/lesson-activities";
import type { LessonBlockOf, LessonDocument } from "@wordinator/contracts/lesson-document";
import { lessonImageUploadResponseSchema } from "@wordinator/contracts/lesson-document";
import { speechClipHash } from "@wordinator/contracts/speech";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeAiSettings } from "../src/ai";
import { speechChunks } from "../src/lessonActivities/speech";
import { addLesson, blocks, createCourse, documentOf, errorCode, join, lessonPath, publishLesson, readLesson, resetDatabase, saveDraft, seedGroup, seedUser, signIn, word } from "./courseApi";
import { call, say, scriptedAi } from "./tutorApi";
import { fetchWorker } from "./worker";

// Lesson activities (docs/lesson-activities.md, LESSON_ACTIVITIES_PLAN.html sections 05, 06 and 09): the global lesson routes under
// /api/courses/:courseId/lessons/:lessonId/activities. The provider is only ever the stubbed Workers AI binding that call() passes
// in, so no real network call happens (the same approach as ai-practices.test.ts and ai-metering.test.ts).

type Ai = ReturnType<typeof scriptedAi>;
type OpenBody = ReturnType<typeof activityOpenResponseSchema.parse>;
type Ready = Extract<OpenBody, { status: "ready" }>;

const uuid = () => crypto.randomUUID();
const plain = (text: string) => [{ type: "text" as const, text, styles: {} }];
const dialogue = (turns: Array<{ speaker: string; text: string }>) => ({ id: uuid(), type: "dialogue" as const, props: { turns: JSON.stringify(turns) }, children: [] });
const callout = (text: string) => ({ id: uuid(), type: "callout" as const, props: { variant: "grammar" as const, icon: "auto" as const }, content: plain(text), children: [] });

const GRAMMAR_TYPES: ActivityType[] = ["grammar_explanation", "guided_grammar", "tricky_grammar"];
const STORY_TYPES: ActivityType[] = ["story_summary", "story_comprehension", "read_aloud", "speak_from_english"];
const SOFIA_LINE = "Goedemorgen, ik wil graag brood kopen.";
const PIETER_LINE = "Goedemorgen! Wat wilt u hebben?";

// Intro paragraph, a story section with a Sofia/Pieter dialogue, a grammar section with a grammar callout and a level-3 subsection,
// and a Summary section. The partner line and the learner speaker label can be changed for a test.
function marketLesson(partner = PIETER_LINE, sofiaSpeaker = "Sofia", imageUrl: string | null = null) {
  const story = blocks.heading("Story: at the market");
  const scene = dialogue([{ speaker: sofiaSpeaker, text: SOFIA_LINE }, { speaker: "Pieter", text: partner }]);
  const grammar = blocks.heading("Grammar: verb second");
  const subsection = blocks.heading("Questions", 3);
  const summary = blocks.heading("Summary");
  const document = documentOf(
    blocks.paragraph("Welcome. Today we shop for bread and practise word order."), blocks.vocabulary(word("brood"), word("koop")),
    story, ...(imageUrl ? [blocks.image(imageUrl, "The market")] : []), blocks.paragraph("Sofia goes to the bakery early in the morning."), scene,
    grammar, callout("In a main clause the verb takes second place."), blocks.paragraph("Put the verb after the first element."),
    blocks.example("Ik koop brood.", "I buy bread."),
    subsection, blocks.paragraph("Questions start with the question word, then the verb."), blocks.example("Koop jij brood?", "Do you buy bread?"),
    summary, blocks.paragraph("You practised verb position in main clauses."),
  );
  return { document, ids: { story: story.id, dialogue: scene.id, grammar: grammar.id, subsection: subsection.id, summary: summary.id } };
}

// Model replies are content only (docs/lesson-activities.md#model-output): no IDs, type or versions. `correctIndex` names the correct
// option; the server assigns every ID. tricky() is four choice questions; the first has the verb-second sentence options.
function tricky(correctIndex = 0, extra: Record<string, unknown> = {}) {
  const questions = [0, 1, 2, 3].map((index) => index === 0
    ? { kind: "choice", prompt: "Which sentence puts the verb second?", options: ["Ik koop brood.", "Ik brood koop.", "Brood ik koop."], correctIndex, explanation: "The verb is the second element." }
    : { kind: "choice", prompt: `Grammar question ${index + 1}?`, options: ["Yes", "No", "Maybe"], correctIndex, explanation: "The lesson says so." });
  return { json: JSON.stringify({ questions, metrics: ["lesson_grammar"], ...extra }) };
}

function story(correctIndex = 0) {
  const questions = [0, 1, 2, 3].map((index) => ({
    prompt: `Scene question ${index + 1}?`, options: ["Yes", "No", "Maybe"], correctIndex, explanation: "The scene says so.",
  }));
  return { json: JSON.stringify({ questions, metrics: ["lesson_reading"] }) };
}

const summary = (extra: Record<string, unknown> = {}) => ({
  pairs: [{ dutch: "Sofia gaat naar de bakker.", english: "Sofia goes to the baker." }, { dutch: "Ze koopt brood.", english: "She buys bread." }],
  newWords: [{ term: "bakker", translation: "baker" }], metrics: ["lesson_share"], ...extra,
});

// The IDs the server assigned, read from the opened view. Options keep the model's order, so option 0 is the correct one for tricky()
// and story() with their default correctIndex.
type OpenedPayload = Ready["activity"]["payload"];
function trickyAll(opened: Ready) {
  const payload = opened.activity.payload as Extract<OpenedPayload, { type: "tricky_grammar" }>;
  return payload.questions.map((question) => {
    if (question.kind !== "choice") throw new Error("Expected choice questions.");
    return { question: question.id, correct: question.options[0]!.id, wrong: question.options[1]!.id };
  });
}
const trickyIds = (opened: Ready) => trickyAll(opened)[0]!;
function storyQuestions(opened: Ready) {
  const payload = opened.activity.payload as Extract<OpenedPayload, { type: "story_comprehension" }>;
  return payload.questions.map((question) => ({ id: question.id, correct: question.options[0]!.id, wrong: question.options[1]!.id }));
}

// Role-play model reply: English only, one entry per source turn in order. The Dutch lines, speakers and order come from the lesson.
function roleplay(englishPartner = "Good morning! What would you like?") {
  return JSON.stringify({ cues: [
    { index: 0, englishText: "Good morning, I want to buy bread.", cue: "Say good morning and ask for bread." },
    { index: 1, englishText: englishPartner, cue: englishPartner },
  ] });
}

// Lesson images must be uploaded to the lesson before a document can use them.
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 3, 0, 0, 0, 2]);
async function uploadImage(path: string, cookie: string) {
  const form = new FormData(); form.set("image", new File([png.slice().buffer as ArrayBuffer], "picture.png", { type: "image/png" }));
  const response = await fetchWorker(`https://wordinator.test${path}/images`, { method: "POST", headers: { cookie }, body: form });
  expect(response.status).toBe(201);
  return lessonImageUploadResponseSchema.parse(await response.json()).url;
}

async function setup(options: { partner?: string; sofiaSpeaker?: string; image?: boolean } = {}) {
  const ownerId = await seedUser("act-owner");
  const learnerId = await seedUser("act-learner");
  const rivalId = await seedUser("act-rival");
  const newcomerId = await seedUser("act-newcomer");
  await seedUser("act-stranger");
  const groupId = await seedGroup("act", ownerId);
  await join(groupId, learnerId); await join(groupId, rivalId); await join(groupId, newcomerId);
  // A member who has not finished username setup: the account-level gate refuses every activity route.
  await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
  const owner = await signIn("act-owner");
  const learner = await signIn("act-learner");
  const rival = await signIn("act-rival");
  const newcomer = await signIn("act-newcomer");
  const stranger = await signIn("act-stranger");

  const course = await createCourse(groupId, owner, true, { title: "Market Dutch", summary: "Shopping." });
  let lesson: Awaited<ReturnType<typeof addLesson>>["lesson"];
  let market: ReturnType<typeof marketLesson>;
  if (options.image) {
    // The story section starts with one uploaded image: create the lesson, upload, then save and publish the document that uses it.
    const created = await addLesson(groupId, course.id, owner, "Market visit", { published: false });
    market = marketLesson(options.partner, options.sofiaSpeaker, await uploadImage(created.path, owner));
    await saveDraft(created.path, owner, market.document, (await readLesson(created.path, owner)).draft!.version);
    lesson = await publishLesson(created.path, owner, (await readLesson(created.path, owner)).draft!.version);
  } else {
    market = marketLesson(options.partner, options.sofiaSpeaker);
    lesson = (await addLesson(groupId, course.id, owner, "Market visit", { document: market.document })).lesson;
  }
  const second = (await addLesson(groupId, course.id, owner, "Second lesson", { document: documentOf(blocks.heading("Other"), blocks.paragraph("Another lesson.")) })).lesson;
  const unpublished = (await addLesson(groupId, course.id, owner, "Unpublished", { published: false, document: documentOf(blocks.paragraph("Not yet.")) })).lesson;
  const otherCourse = await createCourse(groupId, owner, true, { title: "Second course", summary: "Also published." });
  await addLesson(groupId, otherCourse.id, owner, "Elsewhere", { document: documentOf(blocks.paragraph("Elsewhere.")) });
  const draftCourse = await createCourse(groupId, owner, false, { title: "Draft course", summary: "Not yet." });
  const hidden = (await addLesson(groupId, draftCourse.id, owner, "Hidden", { document: documentOf(blocks.paragraph("Hidden.")) })).lesson;

  const base = `/api/courses/${course.id}/lessons/${lesson.id}/activities`;
  const descriptors = activityDescriptorListResponseSchema.parse(await (await call("GET", base, learner)).json()).descriptors;
  const descriptor = (sourceId: string): ActivityDescriptor => {
    const found = descriptors.find((item) => item.sourceId === sourceId);
    if (!found) throw new Error(`No activity source ${sourceId}`);
    return found;
  };
  return {
    owner, learner, rival, newcomer, stranger, groupId, courseId: course.id, lessonId: lesson.id, secondId: second.id, unpublishedId: unpublished.id,
    otherCourseId: otherCourse.id, hiddenLessonId: hidden.id, draftCourseId: draftCourse.id, ids: market.ids, base, descriptors, descriptor,
  };
}
// Opens an activity with the given stub; `ai` is the only model the route can reach.
const openActivity = (cookie: string, base: string, source: ActivityDescriptor, type: ActivityType, ai?: Ai, fingerprint = source.fingerprint) =>
  call("POST", `${base}/open`, cookie, { sourceId: source.sourceId, type, expectedFingerprint: fingerprint }, ai ? { AI: ai.binding } : {});

async function readyOpen(response: Response): Promise<Ready> {
  const text = await response.clone().text();
  expect(response.status, text).toBe(200);
  const body = activityOpenResponseSchema.parse(JSON.parse(text));
  expect(body.status).toBe("ready");
  if (body.status !== "ready") throw new Error("Expected a ready activity.");
  return body;
}

const answerBody = (runId: string, itemId: string, optionId: string, key = uuid()) => ({
  runId, itemId, answer: { kind: "choice", optionId }, inputMode: "typed", idempotencyKey: key,
});

const countRows = async (sql: string, ...values: unknown[]) => (await env.DB.prepare(sql).bind(...values).first<{ n: number }>())!.n;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM lesson_activity_answers"), env.DB.prepare("DELETE FROM lesson_activity_runs"),
    env.DB.prepare("DELETE FROM lesson_activities"), env.DB.prepare("DELETE FROM ai_turn_reservations"),
    env.DB.prepare("DELETE FROM ai_usage"), env.DB.prepare("DELETE FROM platform_metadata WHERE key = 'ai_settings'"),
  ]);
  await resetDatabase();
});

describe("authentication and visibility", () => {
  it("refuses anonymous requests with 401", async () => {
    const s = await setup();
    expect(await errorCode(await call("GET", s.base, null))).toBe("AUTH_REQUIRED");
    expect(await errorCode(await call("POST", `${s.base}/open`, null, { sourceId: "x", type: "story_summary", expectedFingerprint: "0".repeat(64) }))).toBe("AUTH_REQUIRED");
    const anonymousStatus = await call("GET", `${s.base}/${uuid()}`, null);
    expect(anonymousStatus.status).toBe(401);
    expect(await errorCode(anonymousStatus)).toBe("AUTH_REQUIRED");
  });

  it("refuses a signed-in account that has not completed username setup", async () => {
    const s = await setup();
    const listed = await call("GET", s.base, s.newcomer);
    expect(listed.status).toBe(403);
    expect(await errorCode(listed)).toBe("ONBOARDING_REQUIRED");
    const opened = await openActivity(s.newcomer, s.base, s.descriptor(s.ids.story), "story_summary");
    expect(opened.status).toBe(403);
    expect(await errorCode(opened)).toBe("ONBOARDING_REQUIRED");
    const polled = await call("GET", `${s.base}/${uuid()}`, s.newcomer);
    expect(polled.status).toBe(403);
    expect(await errorCode(polled)).toBe("ONBOARDING_REQUIRED");
  });

  it("hides unpublished lessons, lessons in draft courses, and courses the account cannot see", async () => {
    const s = await setup();
    const unpublished = `/api/courses/${s.courseId}/lessons/${s.unpublishedId}/activities`;
    expect((await call("GET", unpublished, s.learner)).status).toBe(404);
    expect(await errorCode(await call("GET", unpublished, s.learner))).toBe("LESSON_NOT_FOUND");
    expect((await openActivity(s.learner, unpublished, s.descriptor(s.ids.story), "story_summary")).status).toBe(404);
    expect(await errorCode(await call("GET", `${unpublished}/${uuid()}`, s.learner))).toBe("LESSON_NOT_FOUND");

    const hidden = `/api/courses/${s.draftCourseId}/lessons/${s.hiddenLessonId}/activities`;
    expect(await errorCode(await call("GET", hidden, s.learner))).toBe("LESSON_NOT_FOUND");
    expect(await errorCode(await call("GET", `${hidden}/${uuid()}`, s.learner))).toBe("LESSON_NOT_FOUND");
    expect((await openActivity(s.learner, hidden, s.descriptor(s.ids.story), "story_summary")).status).toBe(404);
    // The owner sees the published lesson in the draft course; the learner, who is not a contributor there, does not.
    expect((await call("GET", hidden, s.owner)).status).toBe(200);

    // The stranger is signed in but is not a member of the library.
    expect(await errorCode(await call("GET", s.base, s.stranger))).toBe("LESSON_NOT_FOUND");
    expect((await openActivity(s.stranger, s.base, s.descriptor(s.ids.grammar), "tricky_grammar")).status).toBe(404);
  });

  it("refuses an activity addressed through the wrong lesson or course", async () => {
    const s = await setup();
    const ai = scriptedAi([say(tricky().json)]);
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    const wrongLesson = `/api/courses/${s.courseId}/lessons/${s.secondId}/activities/${opened.activity.id}`;
    expect(await errorCode(await call("GET", wrongLesson, s.learner))).toBe("ACTIVITY_NOT_FOUND");
    expect((await call("PATCH", `${wrongLesson}/run`, s.learner, { action: "restart" })).status).toBe(404);
    expect((await call("POST", `${wrongLesson}/answers`, s.learner, answerBody(opened.run.id, opened.activity.id, uuid()))).status).toBe(404);
    const wrongCourse = `/api/courses/${s.otherCourseId}/lessons/${s.lessonId}/activities/${opened.activity.id}`;
    expect((await call("GET", wrongCourse, s.learner)).status).toBe(404);
    expect(ai.calls).toHaveLength(1);
  });
});

describe("descriptors", () => {
  it("returns the same deterministic descriptors on every call, with no payload or reference fields", async () => {
    const s = await setup();
    const first = await (await call("GET", s.base, s.learner)).text();
    const second = await (await call("GET", s.base, s.learner)).text();
    expect(second).toBe(first);
    expect(first).not.toMatch(/"payload"|correctOptionId|referenceAnswers|expectedOrder|referenceText|"explanation"/);
    expect(activityDescriptorListResponseSchema.parse(JSON.parse(first)).descriptors).toHaveLength(s.descriptors.length);
  });

  it("offers the story, grammar, subsection, summary, role-play, and lesson-end sources and no others", async () => {
    const s = await setup();
    const offered = Object.fromEntries(s.descriptors.map((item) => [item.sourceId, item.activityTypes]));
    expect(offered).toEqual({
      [s.ids.story]: STORY_TYPES,
      [s.ids.dialogue]: ["roleplay"],
      [s.ids.grammar]: GRAMMAR_TYPES,
      [s.ids.subsection]: GRAMMAR_TYPES,
      [s.ids.summary]: ["mixed_practice"],
      lesson_end: ["mixed_practice"],
    });
  });
});

describe("opening", () => {
  it("answers 409 SOURCE_CHANGED for a stale or wrong fingerprint, and for a type the source does not offer", async () => {
    const s = await setup();
    const ai = scriptedAi([]);
    const stale = await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai, "0".repeat(64));
    expect(stale.status).toBe(409);
    expect(await errorCode(stale)).toBe("SOURCE_CHANGED");
    const wrongType = await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "tricky_grammar", ai);
    expect(await errorCode(wrongType)).toBe("SOURCE_CHANGED");
    expect(ai.calls).toHaveLength(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities")).toBe(0);
  });

  it("shares one cached activity between accounts and gives each account its own run", async () => {
    const s = await setup();
    const q = tricky();
    const ai = scriptedAi([say(q.json)]);
    const first = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    const second = await readyOpen(await openActivity(s.rival, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    expect(second.activity.id).toBe(first.activity.id);
    expect(second.activity.payload).toEqual(first.activity.payload);
    expect(second.run.id).not.toBe(first.run.id);
    expect(first.run).toMatchObject({ cursor: 0, status: "active", cueMode: "english", ephemeral: false });
    expect(ai.calls).toHaveLength(1);
    expect(ai.remaining()).toBe(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities")).toBe(1);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_runs")).toBe(2);
  });
});

describe("references stay server-side until submission", () => {
  it("never sends correct options, reference answers, expected order, explanations or reference text before an answer", async () => {
    const s = await setup();
    const q = tricky();
    const sc = story();
    const dialogueSource = s.descriptor(s.ids.dialogue);
    const ai = scriptedAi([say(q.json), say(sc.json), say(roleplay())]);
    const trickyOpen = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    const storyOpen = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "story_comprehension", ai));
    const playOpen = await readyOpen(await openActivity(s.learner, s.base, dialogueSource, "roleplay", ai));
    const forbidden = /correctOptionId|referenceAnswers|expectedOrder|"explanation"|referenceText/;
    for (const body of [trickyOpen, storyOpen, playOpen]) expect(JSON.stringify(body.activity)).not.toMatch(forbidden);
    const polled = await call("GET", `${s.base}/${trickyOpen.activity.id}`, s.learner);
    expect(JSON.stringify(activityStatusResponseSchema.parse(await polled.json()))).not.toMatch(forbidden);
    expect(JSON.stringify(trickyOpen.activity.payload)).toContain(trickyIds(trickyOpen).question);
  });
});

describe("answers", () => {
  it("grades correct and incorrect choices on the server and reveals the reference after submission", async () => {
    const s = await setup();
    const q = tricky();
    const ai = scriptedAi([say(q.json)]);
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    const ids = trickyIds(opened);
    const path = `${s.base}/${opened.activity.id}/answers`;
    const right = await call("POST", path, s.learner, answerBody(opened.run.id, ids.question, ids.correct));
    expect(right.status).toBe(200);
    expect(activityAnswerResponseSchema.parse(await right.json())).toMatchObject({
      itemId: ids.question, correct: true, reference: "Ik koop brood.", explanation: "The verb is the second element.",
    });
    const wrong = await call("POST", path, s.learner, answerBody(opened.run.id, ids.question, ids.wrong));
    expect(activityAnswerResponseSchema.parse(await wrong.json())).toMatchObject({ correct: false, reference: "Ik koop brood." });
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_answers WHERE run_id = ?", opened.run.id)).toBe(2);
  });

  it("returns the stored answer for a repeated idempotency key and keeps one row", async () => {
    const s = await setup();
    const q = tricky();
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));
    const ids = trickyIds(opened);
    const path = `${s.base}/${opened.activity.id}/answers`;
    const key = uuid();
    const first = activityAnswerResponseSchema.parse(await (await call("POST", path, s.learner, answerBody(opened.run.id, ids.question, ids.correct, key))).json());
    // The ID the first response returns is the stored row's ID.
    const stored = await env.DB.prepare("SELECT id FROM lesson_activity_answers WHERE idempotency_key = ?").bind(key).first<{ id: string }>();
    expect(stored?.id).toBe(first.answerId);
    const again = await call("POST", path, s.learner, answerBody(opened.run.id, ids.question, ids.correct, key));
    expect(again.status).toBe(200);
    expect(activityAnswerResponseSchema.parse(await again.json())).toMatchObject({ answerId: first.answerId, correct: true });
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_answers WHERE run_id = ? AND idempotency_key = ?", opened.run.id, key)).toBe(1);
  });

  it("refuses another account's run, and an item that is not part of this activity", async () => {
    const s = await setup();
    const q = tricky();
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));
    await readyOpen(await openActivity(s.rival, s.base, s.descriptor(s.ids.grammar), "tricky_grammar"));
    const ids = trickyIds(opened);
    const path = `${s.base}/${opened.activity.id}/answers`;
    const denied = await call("POST", path, s.rival, answerBody(opened.run.id, ids.question, ids.correct));
    expect(denied.status).toBe(404);
    expect(await errorCode(denied)).toBe("ACTIVITY_RUN_NOT_FOUND");
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_answers")).toBe(0);
    const foreignItem = await call("POST", path, s.learner, answerBody(opened.run.id, uuid(), ids.correct));
    expect(foreignItem.status).toBe(400);
    expect(await errorCode(foreignItem)).toBe("ACTIVITY_ITEM_INVALID");
  });
});

describe("run progress", () => {
  it("moves the cursor only after an answer, requires every item before completion, and restarts", async () => {
    const s = await setup();
    const sc = story();
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "story_comprehension", scriptedAi([say(sc.json)])));
    const questions = storyQuestions(opened);
    const runPath = `${s.base}/${opened.activity.id}/run`;
    const answersPath = `${s.base}/${opened.activity.id}/answers`;
    const patch = (body: unknown) => call("PATCH", runPath, s.learner, body);

    // Continue before answering the current question is refused.
    const early = await patch({ action: "continue", expectedCursor: 0 });
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe("ACTIVITY_ANSWER_REQUIRED");

    const [first, second, third, fourth] = questions;
    expect((await call("POST", answersPath, s.learner, answerBody(opened.run.id, first!.id, first!.correct))).status).toBe(200);
    const moved = activityRunPatchResponseSchema.parse(await (await patch({ action: "continue", expectedCursor: 0 })).json());
    expect(moved.run).toMatchObject({ cursor: 1, status: "active" });

    // A stale cursor is refused without moving the run.
    const stale = await patch({ action: "continue", expectedCursor: 0 });
    expect(await errorCode(stale)).toBe("ACTIVITY_CURSOR_STALE");

    // Completing with only one of four items answered is refused.
    const incomplete = await patch({ action: "complete" });
    expect(incomplete.status).toBe(409);
    expect(await errorCode(incomplete)).toBe("ACTIVITY_INCOMPLETE");

    // Restart resets the cursor to the first item without deleting the stored answer.
    const restarted = activityRunPatchResponseSchema.parse(await (await patch({ action: "restart" })).json());
    expect(restarted.run).toMatchObject({ cursor: 0, status: "active", completedAt: null });
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_answers WHERE run_id = ?", opened.run.id)).toBe(1);

    for (const item of [second!, third!, fourth!]) expect((await call("POST", answersPath, s.learner, answerBody(opened.run.id, item.id, item.correct))).status).toBe(200);
    const completed = activityRunPatchResponseSchema.parse(await (await patch({ action: "complete" })).json());
    expect(completed.run).toMatchObject({ status: "completed" });
    expect(completed.run.completedAt).not.toBeNull();
  });
});

// The viewer's own completed activities (docs/lesson-activities.md#scope-and-entry-point): listed only while the section's source
// fingerprint is current, and never another account's.
describe("completed activities", () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const listing = async (s: Setup, cookie: string) => activityDescriptorListResponseSchema.parse(await (await call("GET", s.base, cookie)).json());

  // Opens the grammar section's tricky questions as the given account, answers every one correctly and returns the opened activity.
  async function answerQuick(s: Setup, cookie: string, ai?: Ai) {
    const opened = await readyOpen(await openActivity(cookie, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    for (const ids of trickyAll(opened)) {
      const answered = await call("POST", `${s.base}/${opened.activity.id}/answers`, cookie, answerBody(opened.run.id, ids.question, ids.correct));
      expect(answered.status).toBe(200);
    }
    return opened;
  }
  const patchRun = (s: Setup, cookie: string, activityId: string, body: unknown) => call("PATCH", `${s.base}/${activityId}/run`, cookie, body);

  // Saves and publishes the lesson with its grammar callout's text changed. Every block ID stays the same, so only the section's
  // content (and therefore its fingerprint) moves.
  async function republishGrammar(s: Setup, text: string) {
    const path = lessonPath(s.groupId, s.courseId, s.lessonId);
    const lesson = await readLesson(path, s.owner);
    const document = structuredClone(lesson.draft!.document) as LessonDocument;
    const callout = document.blocks.find((block): block is LessonBlockOf<"callout"> => block.type === "callout");
    if (!callout) throw new Error("No grammar callout in the lesson");
    callout.content = [{ type: "text", text, styles: {} }] as typeof callout.content;
    await saveDraft(path, s.owner, document, lesson.draft!.version);
    await publishLesson(path, s.owner, (await readLesson(path, s.owner)).draft!.version);
  }

  it("lists a completed activity for its owner only, and not while it is only answered", async () => {
    const s = await setup();
    const opened = await answerQuick(s, s.learner, scriptedAi([say(tricky().json)]));
    expect((await listing(s, s.learner)).completed).toEqual([]);

    // The rival opens the same shared activity and never finishes it: the learner's completion is not theirs.
    await readyOpen(await openActivity(s.rival, s.base, s.descriptor(s.ids.grammar), "tricky_grammar"));
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    expect((await listing(s, s.learner)).completed).toEqual([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);
    expect((await listing(s, s.rival)).completed).toEqual([]);
  });

  it("drops a completion once the section's text changes and the lesson is republished", async () => {
    const s = await setup();
    const opened = await answerQuick(s, s.learner, scriptedAi([say(tricky().json)]));
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    expect((await listing(s, s.learner)).completed).toEqual([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);

    await republishGrammar(s, "In a main clause the verb always takes second place.");
    const after = await listing(s, s.learner);
    const section = after.descriptors.find((item) => item.sourceId === s.ids.grammar);
    expect(section?.fingerprint).not.toBe(s.descriptor(s.ids.grammar).fingerprint);
    expect(after.completed).toEqual([]);
  });

  it("drops a completion when the run restarts, and lists it again once the run completes", async () => {
    const s = await setup();
    const opened = await answerQuick(s, s.learner, scriptedAi([say(tricky().json)]));
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    expect((await listing(s, s.learner)).completed).toHaveLength(1);

    const restarted = await patchRun(s, s.learner, opened.activity.id, { action: "restart" });
    expect(restarted.status).toBe(200);
    expect((await listing(s, s.learner)).completed).toEqual([]);

    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    expect((await listing(s, s.learner)).completed).toEqual([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);
  });

  it("keeps the list deterministic for the same state", async () => {
    const s = await setup();
    const opened = await answerQuick(s, s.learner, scriptedAi([say(tricky().json)]));
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    const first = await (await call("GET", s.base, s.learner)).text();
    expect(await (await call("GET", s.base, s.learner)).text()).toBe(first);
    expect(first).not.toMatch(/"payload"|correctOptionId|referenceAnswers|expectedOrder|referenceText|"explanation"/);
  });
});

describe("provider failures", () => {
  it("turns malformed output into a failed row that a later status read reports with a retry hint", async () => {
    const s = await setup();
    const ai = scriptedAi([say("Here is your activity, but it is not JSON.")]);
    const failed = await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai);
    expect(failed.status).toBe(503);
    expect(await errorCode(failed)).toBe("ACTIVITY_GENERATION_FAILED");
    expect(ai.calls).toHaveLength(1);

    const row = await env.DB.prepare("SELECT id, status FROM lesson_activities WHERE source_id = ? AND activity_type = ?")
      .bind(s.ids.grammar, "tricky_grammar").first<{ id: string; status: string }>();
    expect(row?.status).toBe("failed");
    const status = await call("GET", `${s.base}/${row!.id}`, s.learner);
    expect(status.status).toBe(200);
    const body = activityStatusResponseSchema.parse(await status.json());
    expect(body).toMatchObject({ status: "failed", retryAfterMs: expect.any(Number) });
    const wait = (body as { retryAfterMs: number }).retryAfterMs;
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(30_000);

    // Inside the backoff a retry reports generating without calling the provider again.
    const retry = await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai);
    expect(retry.status).toBe(202);
    expect(ai.calls).toHaveLength(1);
  });
});

// Model output contract (docs/lesson-activities.md#model-output): the model writes content only, the server assigns every ID.
describe("model output contract", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fence = (body: string) => `\`\`\`json\n${body}\n\`\`\``;
  const wrappings: Array<[string, (body: string) => string]> = [
    ["a json fence", fence],
    ["a bare fence", (body) => `\`\`\`\n${body}\n\`\`\``],
    ["prose around the object", (body) => `Here is the activity:\n${body}\nHope that helps.`],
  ];
  const choiceItem = (prompt: string, correctIndex = 0) => ({
    kind: "choice", prompt, options: ["Alpha", "Beta", "Gamma"], correctIndex, explanation: "Because.",
  });
  let logs: string[];
  const logged = (name: string) => logs.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.event === name);
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => { logs.push(String(line)); });
  });

  it.each(wrappings)("accepts tricky questions with extra keys wrapped in %s", async (_, wrap) => {
    const s = await setup();
    const reply = { id: "lesson_001", type: "tricky_grammar", recipeVersion: 9, schemaVersion: 9, ...JSON.parse(tricky().json) };
    const ai = scriptedAi([say(wrap(JSON.stringify(reply)))]);
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    expect(Object.keys(opened.activity.payload).sort()).toEqual(["questions", "recipeVersion", "schemaVersion", "type"]);
    expect(opened.activity.payload).toMatchObject({ type: "tricky_grammar", recipeVersion: 2, schemaVersion: 2 });
  });

  it.each(wrappings)("accepts a summary with an extra top-level id wrapped in %s", async (_, wrap) => {
    const s = await setup();
    const reply = { id: "lesson_001", ...summary() };
    const ai = scriptedAi([say(wrap(JSON.stringify(reply)))]);
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "story_summary", ai));
    expect(opened.activity.payload).toEqual({ type: "story_summary", recipeVersion: 2, schemaVersion: 2, pairs: reply.pairs, newWords: reply.newWords, image: null });
  });

  it("ignores model IDs that are not UUIDs and uses server-assigned UUIDs", async () => {
    const s = await setup();
    const base = JSON.parse(tricky().json) as { questions: Array<Record<string, unknown>> };
    const reply = { id: "lesson_001", questions: base.questions.map((question, index) => index === 0 ? { ...question, id: "q_1" } : question) };
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(JSON.stringify(reply))])));
    const ids = trickyIds(opened);
    expect(ids.question).toMatch(UUID);
    expect(ids.question).not.toBe("q_1");
    expect(ids.correct).toMatch(UUID);
    expect(ids.wrong).toMatch(UUID);
    expect(new Set([ids.question, ids.correct, ids.wrong]).size).toBe(3);
  });

  it("grades the option at correctIndex as correct, whichever position the model chose", async () => {
    const s = await setup();
    const q = tricky(2);
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));
    if (opened.activity.payload.type !== "tricky_grammar") throw new Error("Expected tricky_grammar.");
    const question = opened.activity.payload.questions[0]!;
    if (question.kind !== "choice") throw new Error("Expected a choice question.");
    const [first, , third] = question.options;
    const path = `${s.base}/${opened.activity.id}/answers`;
    const itemId = question.id;
    const right = await call("POST", path, s.learner, answerBody(opened.run.id, itemId, third!.id));
    expect(activityAnswerResponseSchema.parse(await right.json())).toMatchObject({ correct: true, reference: "Brood ik koop." });
    const wrong = await call("POST", path, s.learner, answerBody(opened.run.id, itemId, first!.id));
    expect(activityAnswerResponseSchema.parse(await wrong.json())).toMatchObject({ correct: false, reference: "Brood ik koop." });
  });

  it("fails a wrong question count as ACTIVITY_OUTPUT_INVALID and logs only the issue paths", async () => {
    const s = await setup();
    const three = JSON.stringify({ questions: [0, 1, 2].map((index) => choiceItem(`Scene question ${index + 1}?`)) });
    const ai = scriptedAi([say(three)]);
    const failed = await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "story_comprehension", ai);
    expect(failed.status).toBe(503);
    expect(await errorCode(failed)).toBe("ACTIVITY_GENERATION_FAILED");
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE source_id = ? AND activity_type = ? AND status = 'failed'", s.ids.story, "story_comprehension")).toBe(1);
    const events = logged("lesson_activity.output_invalid");
    expect(events).toEqual([expect.objectContaining({ type: "story_comprehension", reason: "schema" })]);
    expect(String(events[0]!.paths)).toContain("questions");
    // The log names the failing path; the model text and the lesson content stay out of it.
    expect(logs.join("\n")).not.toContain("Scene question");
    expect(logs.join("\n")).not.toContain("Yes");
  });

  it("grades a word-order question by the original sentence, whatever order the server shuffled the tokens into", async () => {
    const s = await setup();
    const original = ["Ik", "koop", "brood"];
    const reply = { questions: [
      choiceItem("Pick the main clause."),
      { kind: "fill_in", prompt: "Ik ___ brood.", referenceAnswers: ["koop"], explanation: "The verb is second." },
      { kind: "word_order", prompt: "Put the words in the right order.", tokens: original, explanation: "The verb is second." },
      choiceItem("Pick the verb."), choiceItem("Pick the subject."), choiceItem("Pick the object."),
    ] };
    const ai = scriptedAi([say(JSON.stringify(reply))]);
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.summary), "mixed_practice", ai));
    if (opened.activity.payload.type !== "mixed_practice") throw new Error("Expected mixed_practice.");
    const item = opened.activity.payload.questions[2]!;
    if (item.kind !== "word_order") throw new Error("Expected word_order.");
    expect(item.tokens).not.toEqual(original);
    expect([...item.tokens].sort()).toEqual([...original].sort());
    const answer = (order: number[]) => call("POST", `${s.base}/${opened.activity.id}/answers`, s.learner, {
      runId: opened.run.id, itemId: item.id, answer: { kind: "word_order", order }, inputMode: "typed", idempotencyKey: uuid(),
    });
    const correctOrder = original.map((word) => item.tokens.indexOf(word));
    expect(activityAnswerResponseSchema.parse(await (await answer(correctOrder)).json())).toMatchObject({ correct: true, reference: "Ik koop brood" });
    const reversed = original.map((_, index) => item.tokens.indexOf(original[original.length - 1 - index]!));
    expect(activityAnswerResponseSchema.parse(await (await answer(reversed)).json())).toMatchObject({ correct: false });
  });
});

// Story summary (docs/lesson-activities.md): sentence pairs, new words the lesson does not teach, and an image read from the
// current published document, never from the cached payload.
describe("story summary", () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const openSummary = (s: Setup, reply: unknown, cookie = s.learner) =>
    openActivity(cookie, s.base, s.descriptor(s.ids.story), "story_summary", scriptedAi([say(JSON.stringify(reply))]));
  const storedPayload = async (s: Setup) => JSON.parse((await env.DB.prepare("SELECT payload FROM lesson_activities WHERE source_id = ? AND activity_type = 'story_summary'").bind(s.ids.story).first<{ payload: string }>())!.payload) as Record<string, unknown>;
  const collectImage = (lesson: Awaited<ReturnType<typeof readLesson>>) => {
    const image = lesson.draft!.document.blocks.find((block): block is LessonBlockOf<"image"> => block.type === "image");
    if (!image) throw new Error("No image in the lesson");
    return image.props.url;
  };
  // Publishes the lesson with the story section's image URL changed. The image block ID stays, so the section fingerprint stays too.
  async function publishImage(s: Setup, url: string) {
    const path = lessonPath(s.groupId, s.courseId, s.lessonId);
    const lesson = await readLesson(path, s.owner);
    const document = structuredClone(lesson.draft!.document) as LessonDocument;
    const image = document.blocks.find((block): block is LessonBlockOf<"image"> => block.type === "image");
    if (!image) throw new Error("No image in the lesson");
    image.props.url = url;
    await saveDraft(path, s.owner, document, lesson.draft!.version);
    await publishLesson(path, s.owner, (await readLesson(path, s.owner)).draft!.version);
  }

  it("filters a new word that the lesson already teaches, in any case, and repeats within the list", async () => {
    const s = await setup();
    const reply = summary({ newWords: [
      { term: "BROOD", translation: "bread" }, { term: " Koop ", translation: "buy" }, { term: "bakker", translation: "baker" },
      { term: "Bakker", translation: "baker again" }, { term: "markt", translation: "market" },
    ] });
    const opened = await readyOpen(await openSummary(s, reply));
    if (opened.activity.payload.type !== "story_summary") throw new Error("Expected story_summary.");
    expect(opened.activity.payload.newWords).toEqual([{ term: "bakker", translation: "baker" }, { term: "markt", translation: "market" }]);
    expect(opened.activity.payload.pairs).toEqual(reply.pairs);
  });

  it("fails fewer than two pairs as ACTIVITY_OUTPUT_INVALID", async () => {
    const s = await setup();
    const failed = await openSummary(s, summary({ pairs: [{ dutch: "Sofia gaat naar de bakker.", english: "Sofia goes to the baker." }] }));
    expect(failed.status).toBe(503);
    expect(await errorCode(failed)).toBe("ACTIVITY_GENERATION_FAILED");
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE activity_type = 'story_summary' AND status = 'failed'")).toBe(1);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE status = 'ready'")).toBe(0);
  });

  it("keeps at most three metrics from the enum, once each, and falls back to lesson_share", async () => {
    const s = await setup();
    await readyOpen(await openSummary(s, summary({ metrics: ["bogus", "lesson_reading", "lesson_reading", "lesson_share", "lesson_grammar", "lesson_activities"] })));
    expect((await storedPayload(s)).metrics).toEqual(["lesson_reading", "lesson_share", "lesson_grammar"]);
    await env.DB.prepare("DELETE FROM lesson_activities").run();
    await readyOpen(await openSummary(s, summary({ metrics: ["bogus", 7] })));
    expect((await storedPayload(s)).metrics).toEqual(["lesson_share"]);
    await env.DB.prepare("DELETE FROM lesson_activities").run();
    const { metrics: _omitted, ...withoutMetrics } = summary();
    await readyOpen(await openSummary(s, withoutMetrics));
    expect((await storedPayload(s)).metrics).toEqual(["lesson_share"]);
  });

  it("serves the image from the current published document, never from the cached payload", async () => {
    const s = await setup({ image: true });
    const path = lessonPath(s.groupId, s.courseId, s.lessonId);
    const first = (collectImage(await readLesson(path, s.owner)));
    const second = await uploadImage(path, s.owner);
    expect(second).not.toBe(first);
    const opened = await readyOpen(await openSummary(s, summary()));
    if (opened.activity.payload.type !== "story_summary") throw new Error("Expected story_summary.");
    expect(opened.activity.payload.image).toEqual({ url: first, alt: "The market" });
    expect(JSON.stringify(await storedPayload(s))).not.toContain("image");

    // The lesson is republished with the image block ID unchanged, so the descriptor fingerprint is the same.
    await publishImage(s, second);
    const polled = await call("GET", `${s.base}/${opened.activity.id}`, s.learner);
    expect(polled.status).toBe(200);
    const body = activityStatusResponseSchema.parse(await polled.json());
    if (body.status !== "ready" || body.activity.payload.type !== "story_summary") throw new Error("Expected a ready story_summary.");
    expect(body.activity.payload.image).toEqual({ url: second, alt: "The market" });
    const reopened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "story_summary"));
    expect(reopened.activity.payload).toMatchObject({ image: { url: second } });
  });
});

describe("original-dialogue role-play content", () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const openRoleplay = (s: Setup, ai?: Ai) => openActivity(s.learner, s.base, s.descriptor(s.ids.dialogue), "roleplay", ai);
  const cue = (index: number, englishText = `English line ${index}`, text = `Cue ${index}`) => ({ index, englishText, cue: text });
  const cueReply = (cues: unknown) => JSON.stringify({ cues });
  // The stored payload keeps the references the view omits, so it shows what the server actually holds.
  async function storedRoleplay(sourceId: string) {
    const row = await env.DB.prepare("SELECT payload FROM lesson_activities WHERE source_id = ? AND activity_type = 'roleplay'").bind(sourceId).first<{ payload: string }>();
    const payload = lessonActivityPayloadSchema.parse(JSON.parse(row!.payload));
    if (payload.type !== "roleplay") throw new Error("Expected a role-play payload.");
    return payload;
  }

  it("keeps the lesson's Dutch lines, speakers and order, and marks only Sofia's turn as the learner's", async () => {
    const s = await setup();
    const ai = scriptedAi([say(roleplay())]);
    await readyOpen(await openRoleplay(s, ai));
    expect(ai.calls).toHaveLength(1);
    const stored = await storedRoleplay(s.ids.dialogue);
    expect(stored.dialogueId).toBe(s.ids.dialogue);
    expect(stored.turns.map(({ index, speaker, isLearner, dutchText, referenceText, voice }) => ({ index, speaker, isLearner, dutchText, referenceText, voice }))).toEqual([
      { index: 0, speaker: "Sofia", isLearner: true, dutchText: SOFIA_LINE, referenceText: SOFIA_LINE, voice: null },
      { index: 1, speaker: "Pieter", isLearner: false, dutchText: PIETER_LINE, referenceText: PIETER_LINE, voice: null },
    ]);
    expect(stored.turns[0]).toMatchObject({ englishText: "Good morning, I want to buy bread.", cue: "Say good morning and ask for bread." });
    expect(stored.turns[1]).toMatchObject({ englishText: "Good morning! What would you like?" });
    expect(new Set(stored.turns.map((turn) => turn.id)).size).toBe(2);
  });

  it("uses the model only for English: Dutch-looking English text never replaces a lesson line", async () => {
    const s = await setup();
    await readyOpen(await openRoleplay(s, scriptedAi([say(cueReply([cue(0, "Hoi, ik wil brood kopen."), cue(1, "Hallo! Wat wil je?")]))])));
    const stored = await storedRoleplay(s.ids.dialogue);
    expect(stored.turns.map((turn) => [turn.speaker, turn.dutchText, turn.referenceText])).toEqual([
      ["Sofia", SOFIA_LINE, SOFIA_LINE], ["Pieter", PIETER_LINE, PIETER_LINE],
    ]);
    expect(stored.turns[0]!.englishText).toBe("Hoi, ik wil brood kopen.");
  });

  // Extra keys are stripped, not trusted: the turns still come only from the lesson.
  it.each([
    ["top-level turns that replace the lesson", JSON.stringify({ cues: [cue(0), cue(1)], turns: [{ speaker: "Pieter", dutchText: "Hoi!" }] })],
    ["a Dutch replacement on a turn", cueReply([{ ...cue(0), dutchText: "Hoi!" }, cue(1)])],
    ["a reference replacement on a turn", cueReply([{ ...cue(0), referenceText: "Hoi!" }, cue(1)])],
    ["a speaker change on a turn", cueReply([{ ...cue(0), speaker: "Pieter" }, cue(1)])],
    ["a learner flag change on a turn", cueReply([{ ...cue(0), isLearner: false }, cue(1)])],
    ["a JSON fence", "```json\n" + cueReply([cue(0), cue(1)]) + "\n```"],
  ])("ignores a model reply's attempt at %s and keeps the lesson's turns", async (_label, reply) => {
    const s = await setup();
    await readyOpen(await openRoleplay(s, scriptedAi([say(reply)])));
    const stored = await storedRoleplay(s.ids.dialogue);
    expect(stored.turns.map((turn) => [turn.speaker, turn.isLearner, turn.dutchText, turn.referenceText])).toEqual([
      ["Sofia", true, SOFIA_LINE, SOFIA_LINE], ["Pieter", false, PIETER_LINE, PIETER_LINE],
    ]);
  });

  it.each([
    ["a reordered reply", cueReply([cue(1), cue(0)])],
    ["one cue too few", cueReply([cue(0)])],
    ["one cue too many", cueReply([cue(0), cue(1), cue(2)])],
    ["an index outside the turns", cueReply([cue(0), cue(2)])],
    ["no JSON at all", "Here are the cues."],
  ])("fails the activity, with nothing ready to serve, for a model reply with %s", async (_label, reply) => {
    const s = await setup();
    const ai = scriptedAi([say(reply)]);
    const failed = await openRoleplay(s, ai);
    expect(failed.status).toBe(503);
    expect(await errorCode(failed)).toBe("ACTIVITY_GENERATION_FAILED");
    expect(ai.calls).toHaveLength(1);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE status = 'ready'")).toBe(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE status = 'failed'")).toBe(1);
  });

  it("grades Sofia's turn against the original Dutch line, whatever the model wrote", async () => {
    const s = await setup();
    const opened = await readyOpen(await openRoleplay(s, scriptedAi([say(cueReply([cue(0, "Good morning."), cue(1)]))])));
    const payload = opened.activity.payload;
    if (payload.type !== "roleplay") throw new Error("Expected a role-play payload.");
    const sofiaTurn = payload.turns.find((turn) => turn.isLearner);
    if (!sofiaTurn) throw new Error("Expected Sofia's turn.");
    const path = `${s.base}/${opened.activity.id}/answers`;
    const answer = async (text: string) => activityAnswerResponseSchema.parse(await (await call("POST", path, s.learner, {
      runId: opened.run.id, itemId: sofiaTurn.id, answer: { kind: "text", text }, inputMode: "spoken", idempotencyKey: uuid(),
    })).json());
    expect(await answer(SOFIA_LINE.toUpperCase())).toMatchObject({ itemId: sofiaTurn.id, correct: true, reference: SOFIA_LINE });
    expect(await answer("Goedemorgen, ik wil graag melk kopen.")).toMatchObject({ correct: false, reference: SOFIA_LINE });
  });

  it("matches Sofia's speaker label case-insensitively and trimmed, as the eligibility rule does", async () => {
    const s = await setup({ sofiaSpeaker: "sofia" });
    expect(s.descriptor(s.ids.dialogue).activityTypes).toEqual(["roleplay"]);
    await readyOpen(await openRoleplay(s, scriptedAi([say(roleplay())])));
    const stored = await storedRoleplay(s.ids.dialogue);
    expect(stored.turns.map((turn) => [turn.speaker, turn.isLearner])).toEqual([["sofia", true], ["Pieter", false]]);
  });

  it("refuses a role-play cache miss at the daily cap before any model call", async () => {
    const s = await setup();
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 });
    const none = scriptedAi([]);
    const miss = await openRoleplay(s, none);
    expect(miss.status).toBe(429);
    expect(await errorCode(miss)).toBe("AI_DAILY_LIMIT");
    expect(none.calls).toHaveLength(0);
  });
});

describe("daily AI cap", () => {
  it("refuses a cache miss at the cap but still serves an already-ready activity", async () => {
    const s = await setup();
    const q = tricky();
    const ready = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));

    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 });
    const none = scriptedAi([]);
    const miss = await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "story_comprehension", none);
    expect(miss.status).toBe(429);
    expect(await errorCode(miss)).toBe("AI_DAILY_LIMIT");
    expect(none.calls).toHaveLength(0);

    const hitForOwner = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", none));
    const hitForRival = await readyOpen(await openActivity(s.rival, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", none));
    expect(hitForOwner.activity.id).toBe(ready.activity.id);
    expect(hitForRival.activity.id).toBe(ready.activity.id);
    expect(none.calls).toHaveLength(0);
  });
});

describe("dialogue speech", () => {
  const LONG_LINE = Array.from({ length: 12 }, (_, index) => `Dit is zin nummer ${index + 1} van de lange regel.`).join(" ");
  // Dutch voices in list order are the narrator Fenna, then Colette and Maarten. Sofia, the first speaker without a cast entry,
  // takes Colette. Pieter's cast entry (Fenna) decides his voice, not his position (Maarten).
  const COLETTE = "nl-NL-ColetteNeural";
  const FENNA = "nl-NL-FennaNeural";
  const SPEAK = (base: string, id: string) => `${base}/${id}/speech`;

  type Setup = Awaited<ReturnType<typeof setup>>;
  // Synthesis goes through the Workers fetch; every request body is recorded. A status other than 200 simulates a failed synthesis.
  function stubAzure(status = 200) {
    const bodies: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://germanywestcentral.tts.speech.microsoft.com/cognitiveservices/v1");
      bodies.push(String(init?.body));
      return status === 200 ? new Response(new Uint8Array([1, 2, 3]), { status: 200 }) : new Response("failed", { status });
    });
    return bodies;
  }
  // Clips are written to a recording stand-in for R2, so this suite stays in the isolated D1 configuration. R2 round trips are
  // covered by tutor-speech.test.ts, which runs in the R2 configuration.
  const fakeMedia = () => {
    const keys: string[] = [];
    return { keys, put: async (key: string) => { keys.push(key); return null; } };
  };
  const withSpeech = (configured = true, media = fakeMedia()): Partial<Env> => ({
    AZURE_SPEECH_KEY: configured ? "test-key" : undefined, AZURE_SPEECH_REGION: configured ? "germanywestcentral" : undefined,
    MEDIA: media as unknown as R2Bucket,
  });
  const clipUrl = (hash: string) => `https://wordinator.test/api/media/speech/${hash}.mp3`;
  const speakBody = (opened: Ready, turnId: string, chunkIndex?: number) => ({ runId: opened.run.id, turnId, ...(chunkIndex === undefined ? {} : { chunkIndex }) });
  const turnNamed = (opened: Ready, speaker: string) => {
    const payload = opened.activity.payload;
    const turn = payload.type === "roleplay" ? payload.turns.find((candidate) => candidate.speaker === speaker) : undefined;
    if (!turn) throw new Error(`No turn by ${speaker}`);
    return turn;
  };
  async function openRoleplay(s: Setup) {
    const source = s.descriptor(s.ids.dialogue);
    return readyOpen(await openActivity(s.learner, s.base, source, "roleplay", scriptedAi([say(roleplay())])));
  }
  async function castPieterAsNarrator(courseId: string) {
    await env.DB.prepare("UPDATE courses SET speech_cast = ? WHERE id = ?").bind(JSON.stringify({ Pieter: FENNA }), courseId).run();
  }

  afterEach(() => vi.restoreAllMocks());

  it("speaks a partner line in its course cast voice and serves the clip under the lesson's cache key", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const bodies = stubAzure();
    const media = fakeMedia();
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech(true, media));
    expect(response.status).toBe(200);
    const hash = await speechClipHash({ voice: FENNA, text: PIETER_LINE, ipa: null });
    expect(activitySpeechResponseSchema.parse(await response.json())).toEqual({ status: "ready", url: clipUrl(hash) });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain(`<voice name="${FENNA}">`);
    expect(bodies[0]).toContain(PIETER_LINE);
    expect(media.keys).toEqual([`speech/${hash}.mp3`]);
  });

  it("speaks Sofia's reference line in her positional cast voice", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const bodies = stubAzure();
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Sofia").id), withSpeech());
    const hash = await speechClipHash({ voice: COLETTE, text: SOFIA_LINE, ipa: null });
    expect(await response.json()).toEqual({ status: "ready", url: clipUrl(hash) });
    expect(bodies[0]).toContain(`<voice name="${COLETTE}">`);
  });

  it("serves a repeated request from the cache, and a clip the lesson already holds, without synthesizing again", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const bodies = stubAzure();
    const media = fakeMedia();
    const body = speakBody(opened, turnNamed(opened, "Pieter").id);
    const first = await (await call("POST", SPEAK(s.base, opened.activity.id), s.learner, body, withSpeech(true, media))).json();
    const second = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, body, withSpeech(true, media));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(first);
    expect(bodies).toHaveLength(1);
    expect(media.keys).toHaveLength(1);
    const usage = await env.DB.prepare("SELECT surface, cached FROM speech_usage ORDER BY created_at, rowid").all();
    expect(usage.results).toEqual([{ surface: "lesson_activity", cached: 0 }, { surface: "lesson_activity", cached: 1 }]);

    // A ready clip that the lesson's dialogue already made is served from the same key.
    const hash = await speechClipHash({ voice: COLETTE, text: SOFIA_LINE, ipa: null });
    const now = Date.now();
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, next_attempt_at, claimed_at, created_at, updated_at) VALUES (?, ?, ?, 'ready', 1, NULL, NULL, ?, ?)")
      .bind(hash, COLETTE, SOFIA_LINE.length, now, now).run();
    const sofia = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Sofia").id), withSpeech());
    expect(await sofia.json()).toEqual({ status: "ready", url: clipUrl(hash) });
    expect(bodies).toHaveLength(1);
  });

  it("speaks a long line one part at a time, never whole or truncated", async () => {
    const s = await setup({ partner: LONG_LINE });
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const parts = speechChunks(LONG_LINE);
    expect(parts.length).toBeGreaterThan(1);
    const bodies = stubAzure();
    const turnId = turnNamed(opened, "Pieter").id;
    const path = SPEAK(s.base, opened.activity.id);
    expect(await errorCode(await call("POST", path, s.learner, speakBody(opened, turnId), withSpeech()))).toBe("ACTIVITY_CHUNK_INVALID");
    expect(await errorCode(await call("POST", path, s.learner, speakBody(opened, turnId, parts.length), withSpeech()))).toBe("ACTIVITY_CHUNK_INVALID");
    expect(bodies).toHaveLength(0);
    for (const [index, part] of parts.entries()) {
      const response = await call("POST", path, s.learner, speakBody(opened, turnId, index), withSpeech());
      const hash = await speechClipHash({ voice: FENNA, text: part, ipa: null });
      expect(await response.json()).toEqual({ status: "ready", url: clipUrl(hash) });
    }
    expect(bodies).toHaveLength(parts.length);
    expect(bodies.every((body, index) => body.includes(parts[index]!))).toBe(true);
  });

  it("refuses a chunk index on a short line that has only one part", async () => {
    const s = await setup();
    const opened = await openRoleplay(s);
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Sofia").id, 1), withSpeech());
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("ACTIVITY_CHUNK_INVALID");
  });

  it("answers 202 with a retry hint while another request holds the clip", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const bodies = stubAzure();
    const hash = await speechClipHash({ voice: FENNA, text: PIETER_LINE, ipa: null });
    const now = Date.now();
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, next_attempt_at, claimed_at, created_at, updated_at) VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?, ?)")
      .bind(hash, FENNA, PIETER_LINE.length, now, now, now).run();
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "pending", retryAfterMs: 1000 });
    expect(bodies).toHaveLength(0);
  });

  it("answers 503 SPEECH_FAILED when synthesis fails, and counts the attempt", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const bodies = stubAzure(500);
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech());
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("SPEECH_FAILED");
    expect(bodies).toHaveLength(1);
    const hash = await speechClipHash({ voice: FENNA, text: PIETER_LINE, ipa: null });
    expect(await env.DB.prepare("SELECT status, attempts FROM speech_clips WHERE hash = ?").bind(hash).first()).toEqual({ status: "pending", attempts: 1 });
    expect(await countRows("SELECT COUNT(*) AS n FROM speech_usage")).toBe(0);
  });

  it("refuses audio past the daily character cap before the clip is looked up", async () => {
    const s = await setup();
    const opened = await openRoleplay(s);
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 5 });
    const bodies = stubAzure();
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech());
    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("SPEECH_DAILY_LIMIT");
    expect(bodies).toHaveLength(0);
  });

  it("answers 503 SPEECH_UNAVAILABLE without an Azure key, after the turn is checked", async () => {
    const s = await setup();
    const opened = await openRoleplay(s);
    const bodies = stubAzure();
    const path = SPEAK(s.base, opened.activity.id);
    const unconfigured = await call("POST", path, s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech(false));
    expect(unconfigured.status).toBe(503);
    expect(await errorCode(unconfigured)).toBe("SPEECH_UNAVAILABLE");
    expect(await errorCode(await call("POST", path, s.learner, speakBody(opened, uuid()), withSpeech(false)))).toBe("ACTIVITY_TURN_NOT_FOUND");
    expect(bodies).toHaveLength(0);
  });

  it("answers 404 ACTIVITY_TURN_NOT_FOUND for a turn ID the activity does not contain", async () => {
    const s = await setup();
    const opened = await openRoleplay(s);
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, uuid()), withSpeech());
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe("ACTIVITY_TURN_NOT_FOUND");
  });

  it("refuses speech for an activity that is not a role-play", async () => {
    const s = await setup();
    const q = tricky();
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, { runId: opened.run.id, turnId: uuid() }, withSpeech());
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("ACTIVITY_ACTION_INVALID");
  });

  it("refuses a hidden, unpublished, mismatched, or stranger's request before reading the activity", async () => {
    const s = await setup();
    const opened = await openRoleplay(s);
    const body = speakBody(opened, turnNamed(opened, "Pieter").id);
    const bodies = stubAzure();
    expect(await errorCode(await call("POST", `/api/courses/${s.courseId}/lessons/${s.unpublishedId}/activities/${opened.activity.id}/speech`, s.learner, body, withSpeech()))).toBe("LESSON_NOT_FOUND");
    const hidden = await call("POST", `/api/courses/${s.draftCourseId}/lessons/${s.hiddenLessonId}/activities/${opened.activity.id}/speech`, s.learner, body, withSpeech());
    expect(hidden.status).toBe(404);
    expect(await errorCode(await call("POST", `/api/courses/${s.courseId}/lessons/${s.secondId}/activities/${opened.activity.id}/speech`, s.learner, body, withSpeech()))).toBe("ACTIVITY_NOT_FOUND");
    expect(await errorCode(await call("POST", SPEAK(s.base, opened.activity.id), s.stranger, body, withSpeech()))).toBe("LESSON_NOT_FOUND");
    expect(bodies).toHaveLength(0);
  });

  it("refuses another account's run, and accepts the account's own run on the same activity", async () => {
    const s = await setup();
    const opened = await openRoleplay(s);
    const rivalOpened = await readyOpen(await openActivity(s.rival, s.base, s.descriptor(s.ids.dialogue), "roleplay"));
    const turnId = turnNamed(opened, "Pieter").id;
    const denied = await call("POST", SPEAK(s.base, opened.activity.id), s.rival, { runId: opened.run.id, turnId }, withSpeech());
    expect(denied.status).toBe(404);
    expect(await errorCode(denied)).toBe("ACTIVITY_RUN_NOT_FOUND");
    const bodies = stubAzure();
    const own = await call("POST", SPEAK(s.base, opened.activity.id), s.rival, { runId: rivalOpened.run.id, turnId }, withSpeech());
    expect(own.status).toBe(200);
    expect(bodies).toHaveLength(1);
  });

  it("serves ready audio to an archived course without a run, and makes no new audio there", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openRoleplay(s);
    const bodies = stubAzure();
    const pieter = turnNamed(opened, "Pieter").id;
    const warm = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, pieter), withSpeech());
    const warmBody = await warm.json();
    await env.DB.prepare("UPDATE courses SET status = 'archived' WHERE id = ?").bind(s.courseId).run();
    // An archived course is visible to its owner, who has no run of this activity, so the read-only path answers from the cache.
    const readOnly = await call("POST", SPEAK(s.base, opened.activity.id), s.owner, { runId: crypto.randomUUID(), turnId: pieter }, withSpeech());
    expect(readOnly.status).toBe(200);
    expect(await readOnly.json()).toEqual(warmBody);
    // Audio that is not made yet is not made for an archived course.
    const fresh = await call("POST", SPEAK(s.base, opened.activity.id), s.owner, { runId: crypto.randomUUID(), turnId: turnNamed(opened, "Sofia").id }, withSpeech());
    expect(fresh.status).toBe(409);
    expect(await errorCode(fresh)).toBe("ACTIVITY_READ_ONLY");
    expect(bodies).toHaveLength(1);
  });
});

describe("speechChunks", () => {
  it("returns no chunks for blank text and the trimmed text when it fits the limit", () => {
    expect(speechChunks("   ", 10)).toEqual([]);
    expect(speechChunks("  Hallo.  ", 10)).toEqual(["Hallo."]);
    expect(speechChunks("a".repeat(10), 10)).toEqual(["a".repeat(10)]);
  });

  it("splits one unit over the limit at the sentence end and never past the limit", () => {
    expect(speechChunks("Hallo daar. Hoe gaat het?", 20)).toEqual(["Hallo daar.", "Hoe gaat het?"]);
    expect(speechChunks("Hallo daar. Hoe gaat het?", 25)).toEqual(["Hallo daar. Hoe gaat het?"]);
  });

  it("packs whole sentences greedily, and starts a new chunk for a sentence too long to share one", () => {
    expect(speechChunks("Eerste zin. Tweede zin. Derde zin is langer dan de rest.", 30)).toEqual([
      "Eerste zin. Tweede zin.", "Derde zin is langer dan de", "rest.",
    ]);
  });

  it("cuts a word longer than the limit into parts and keeps every character", () => {
    expect(speechChunks("a".repeat(25), 10)).toEqual(["a".repeat(10), "a".repeat(10), "a".repeat(5)]);
    expect(speechChunks("😀😀😀", 3)).toEqual(["😀", "😀", "😀"]);
  });

  it("keeps every word in order and every chunk within the limit for a long line", () => {
    const line = Array.from({ length: 30 }, (_, index) => `Dit is zin ${index + 1}.`).join(" ");
    for (const max of [12, 40, 300]) {
      const chunks = speechChunks(line, max);
      expect(chunks.every((chunk) => chunk.length > 0 && chunk.length <= max)).toBe(true);
      expect(chunks.join(" ")).toBe(line);
    }
  });

  it("refuses a limit below two", () => {
    expect(() => speechChunks("Hallo.", 1)).toThrow(RangeError);
    expect(() => speechChunks("Hallo.", 2.5)).toThrow(RangeError);
  });
});
