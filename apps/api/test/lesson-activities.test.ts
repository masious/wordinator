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
// /api/courses/:courseId/lessons/:lessonId/activities. The provider is only ever the scripted model endpoint that call() passes
// in (tutorApi.ts), so no real network call happens (the same approach as ai-practices.test.ts and ai-metering.test.ts).

type Ai = ReturnType<typeof scriptedAi>;
type OpenBody = ReturnType<typeof activityOpenResponseSchema.parse>;
type Ready = Extract<OpenBody, { status: "ready" }>;

const uuid = () => crypto.randomUUID();
const plain = (text: string) => [{ type: "text" as const, text, styles: {} }];
const dialogue = (turns: Array<{ speaker: string; text: string }>) => ({ id: uuid(), type: "dialogue" as const, props: { turns: JSON.stringify(turns) }, children: [] });
const callout = (text: string) => ({ id: uuid(), type: "callout" as const, props: { variant: "grammar" as const, icon: "auto" as const }, content: plain(text), children: [] });

const GRAMMAR_TYPES: ActivityType[] = ["guided_grammar", "tricky_grammar"];
const STORY_TYPES: ActivityType[] = ["read_aloud"];
const SOFIA_LINE = "Goedemorgen, ik wil graag brood kopen.";
const PIETER_LINE = "Goedemorgen! Wat wilt u hebben?";

// Intro paragraph, a story section with its words and a Sofia/Pieter dialogue, a grammar section with a grammar callout and a level-3 subsection,
// and a Summary section. The partner line and the learner speaker label can be changed for a test.
function marketLesson(partner = PIETER_LINE, sofiaSpeaker = "Sofia", imageUrl: string | null = null) {
  const story = blocks.heading("Story: at the market");
  const scene = dialogue([{ speaker: sofiaSpeaker, text: SOFIA_LINE }, { speaker: "Pieter", text: partner }]);
  const storyWords = blocks.vocabulary(word("bakker"), word("vroeg"));
  const grammar = blocks.heading("Grammar: verb second");
  const subsection = blocks.heading("Questions", 3);
  const summary = blocks.heading("Summary");
  const document = documentOf(
    blocks.paragraph("Welcome. Today we shop for bread and practise word order."), blocks.vocabulary(word("brood"), word("koop")),
    story, ...(imageUrl ? [blocks.image(imageUrl, "The market")] : []), blocks.paragraph("Sofia goes to the bakery early in the morning."), storyWords, scene,
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

// The IDs the server assigned, read from the opened view. Options keep the model's order, so option 0 is the correct one for tricky()
// with its default correctIndex.
type OpenedPayload = Ready["activity"]["payload"];
function trickyAll(opened: Ready) {
  const payload = opened.activity.payload as Extract<OpenedPayload, { type: "tricky_grammar" }>;
  return payload.questions.map((question) => {
    if (question.kind !== "choice") throw new Error("Expected choice questions.");
    return { question: question.id, correct: question.options[0]!.id, wrong: question.options[1]!.id };
  });
}
const trickyIds = (opened: Ready) => trickyAll(opened)[0]!;

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
  call("POST", `${base}/open`, cookie, { sourceId: source.sourceId, type, expectedFingerprint: fingerprint }, ai ? { ...ai.env } : {});

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
    expect(await errorCode(await call("POST", `${s.base}/open`, null, { sourceId: "x", type: "read_aloud", expectedFingerprint: "0".repeat(64) }))).toBe("AUTH_REQUIRED");
    const anonymousStatus = await call("GET", `${s.base}/${uuid()}`, null);
    expect(anonymousStatus.status).toBe(401);
    expect(await errorCode(anonymousStatus)).toBe("AUTH_REQUIRED");
  });

  it("refuses a signed-in account that has not completed username setup", async () => {
    const s = await setup();
    const listed = await call("GET", s.base, s.newcomer);
    expect(listed.status).toBe(403);
    expect(await errorCode(listed)).toBe("ONBOARDING_REQUIRED");
    const opened = await openActivity(s.newcomer, s.base, s.descriptor(s.ids.story), "read_aloud");
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
    expect((await openActivity(s.learner, unpublished, s.descriptor(s.ids.story), "read_aloud")).status).toBe(404);
    expect(await errorCode(await call("GET", `${unpublished}/${uuid()}`, s.learner))).toBe("LESSON_NOT_FOUND");

    const hidden = `/api/courses/${s.draftCourseId}/lessons/${s.hiddenLessonId}/activities`;
    expect(await errorCode(await call("GET", hidden, s.learner))).toBe("LESSON_NOT_FOUND");
    expect(await errorCode(await call("GET", `${hidden}/${uuid()}`, s.learner))).toBe("LESSON_NOT_FOUND");
    expect((await openActivity(s.learner, hidden, s.descriptor(s.ids.story), "read_aloud")).status).toBe(404);
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

  it("offers the story, grammar, subsection, summary, and lesson-end sources and no others", async () => {
    const s = await setup();
    const offered = Object.fromEntries(s.descriptors.map((item) => [item.sourceId, item.activityTypes]));
    expect(offered).toEqual({
      [s.ids.story]: STORY_TYPES,
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
    expect(first.run).toMatchObject({ cursor: 0, status: "active", reader: null, ephemeral: false });
    expect(ai.calls).toHaveLength(1);
    expect(ai.remaining()).toBe(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities")).toBe(1);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_runs")).toBe(2);
    // The cache row keeps the model that answered, and both accounts see it.
    const stored = await env.DB.prepare("SELECT generated_by AS model FROM lesson_activities").first<string>("model");
    expect(stored).toBeTruthy();
    expect(first.activity.generatedBy).toBe(stored);
    expect(second.activity.generatedBy).toBe(stored);
  });
});

describe("references stay server-side until submission", () => {
  it("never sends correct options, reference answers, expected order, explanations or reference text before an answer", async () => {
    const s = await setup();
    const q = tricky();
    const ai = scriptedAi([say(q.json)]);
    const trickyOpen = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai));
    const playOpen = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.story), "read_aloud"));
    const forbidden = /correctOptionId|referenceAnswers|expectedOrder|"explanation"|referenceText/;
    for (const body of [trickyOpen, playOpen]) expect(JSON.stringify(body.activity)).not.toMatch(forbidden);
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
    const q = tricky();
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));
    const questions = trickyAll(opened);
    const runPath = `${s.base}/${opened.activity.id}/run`;
    const answersPath = `${s.base}/${opened.activity.id}/answers`;
    const patch = (body: unknown) => call("PATCH", runPath, s.learner, body);

    // Continue before answering the current question is refused.
    const early = await patch({ action: "continue", expectedCursor: 0 });
    expect(early.status).toBe(409);
    expect(await errorCode(early)).toBe("ACTIVITY_ANSWER_REQUIRED");

    const [first, second, third, fourth] = questions;
    expect((await call("POST", answersPath, s.learner, answerBody(opened.run.id, first!.question, first!.correct))).status).toBe(200);
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

    for (const item of [second!, third!, fourth!]) expect((await call("POST", answersPath, s.learner, answerBody(opened.run.id, item.question, item.correct))).status).toBe(200);
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
    expect((await listing(s, s.learner)).completed).toMatchObject([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);
    expect((await listing(s, s.rival)).completed).toEqual([]);
  });

  it("scores a completed activity by each item's first answer and records when it finished", async () => {
    const s = await setup();
    const opened = await answerQuick(s, s.learner, scriptedAi([say(tricky().json)]));
    // A second, wrong answer to an already-answered item never changes its first-try score.
    const [first] = trickyAll(opened);
    await call("POST", `${s.base}/${opened.activity.id}/answers`, s.learner, answerBody(opened.run.id, first!.question, first!.wrong));
    const before = Date.now();
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    const [done] = (await listing(s, s.learner)).completed;
    expect(done).toMatchObject({ type: "tricky_grammar", correct: 4, total: 4 });
    expect(done!.completedAt).toBeGreaterThanOrEqual(before - 1_000);
  });

  it("counts a completed guided grammar activity for its owner", async () => {
    const s = await setup();
    const reply = say(JSON.stringify({
      steps: [[0, 1], [2, 3]].map((chunks, index) => ({ chunks, question: { kind: "choice", prompt: `Step ${index + 1}?`, options: ["Alpha", "Beta", "Gamma"], correctIndex: 0, explanation: "Because." } })),
      metrics: ["lesson_grammar"],
    }));
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "guided_grammar", scriptedAi([reply])));
    const payload = opened.activity.payload;
    if (payload.type !== "guided_grammar") throw new Error("Expected guided_grammar.");
    expect((await listing(s, s.learner)).completed).toEqual([]);
    for (const step of payload.steps) {
      const answered = await call("POST", `${s.base}/${opened.activity.id}/answers`, s.learner, answerBody(opened.run.id, step.question.id, step.question.options[0]!.id));
      expect(answered.status).toBe(200);
    }
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    expect((await listing(s, s.learner)).completed).toMatchObject([{ sourceId: s.ids.grammar, type: "guided_grammar" }]);
    expect((await listing(s, s.rival)).completed).toEqual([]);
  });

  it("lists the same descriptors and completions for an archived course as before it was archived", async () => {
    const s = await setup();
    // An archived course is visible to its owner (the learner gets 404), so the owner's completion is the one listed.
    const opened = await answerQuick(s, s.owner, scriptedAi([say(tricky().json)]));
    expect((await patchRun(s, s.owner, opened.activity.id, { action: "complete" })).status).toBe(200);
    const before = await (await call("GET", s.base, s.owner)).text();
    await env.DB.prepare("UPDATE courses SET status = 'archived' WHERE id = ?").bind(s.courseId).run();
    const archived = await call("GET", s.base, s.owner);
    expect(archived.status).toBe(200);
    expect(await archived.text()).toBe(before);
    expect((await listing(s, s.owner)).completed).toMatchObject([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);
  });

  it("drops a completion once the section's text changes and the lesson is republished", async () => {
    const s = await setup();
    const opened = await answerQuick(s, s.learner, scriptedAi([say(tricky().json)]));
    expect((await patchRun(s, s.learner, opened.activity.id, { action: "complete" })).status).toBe(200);
    expect((await listing(s, s.learner)).completed).toMatchObject([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);

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
    expect((await listing(s, s.learner)).completed).toMatchObject([{ sourceId: s.ids.grammar, type: "tricky_grammar" }]);
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
    const failed = await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", ai);
    expect(failed.status).toBe(503);
    expect(await errorCode(failed)).toBe("ACTIVITY_GENERATION_FAILED");
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE source_id = ? AND activity_type = ? AND status = 'failed'", s.ids.grammar, "tricky_grammar")).toBe(1);
    const events = logged("lesson_activity.output_invalid");
    expect(events).toEqual([expect.objectContaining({ type: "tricky_grammar", reason: "schema" })]);
    expect(String(events[0]!.paths)).toContain("questions");
    // The log names the failing path; the model text and the lesson content stay out of it.
    expect(logs.join("\n")).not.toContain("Scene question");
    expect(logs.join("\n")).not.toContain("Yes");
  });

  describe("guided grammar generation", () => {
    const guidedReply = (chunkSets: number[][], extra: Record<string, unknown> = {}) => say(JSON.stringify({
      steps: chunkSets.map((chunks, index) => ({ chunks, question: choiceItem(`Step ${index + 1}?`) })), metrics: ["lesson_grammar"], ...extra,
    }));
    const openGuided = async (reply: ReturnType<typeof say>) => {
      const s = await setup();
      return { s, response: await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "guided_grammar", scriptedAi([reply])) };
    };
    it("fails an index out of range as ACTIVITY_OUTPUT_INVALID with stage chunks", async () => {
      const { response } = await openGuided(guidedReply([[0, 1], [2, 99]]));
      expect(response.status).toBe(503);
      expect(logged("lesson_activity.output_invalid")).toEqual([expect.objectContaining({ type: "guided_grammar", reason: "chunks", stage: "chunks" })]);
    });
    for (const [name, sets] of [["overlapping", [[0, 1], [1, 2]]], ["descending across steps", [[2, 3], [0, 1]]], ["descending within a step", [[1, 0], [2]]]] as const) {
      it(`fails ${name} indices`, async () => {
        const { response } = await openGuided(guidedReply(sets.map((set) => [...set])));
        expect(response.status).toBe(503);
        expect(logged("lesson_activity.output_invalid")).toEqual([expect.objectContaining({ reason: "chunks", stage: "chunks" })]);
      });
    }
    it("stores snapshots of the original blocks and keeps only eligible follow-ups", async () => {
      const { s, response } = await openGuided(guidedReply([[0, 1], [2, 3]], { followUps: ["tricky_grammar", "mixed_practice", "bogus", "tricky_grammar"] }));
      const opened = await readyOpen(response);
      const payload = opened.activity.payload;
      if (payload.type !== "guided_grammar") throw new Error("Expected guided_grammar.");
      const lesson = await readLesson(lessonPath(s.groupId, s.courseId, s.lessonId), s.owner);
      const original = lesson.draft!.document.blocks;
      const grammarIndex = original.findIndex((block) => block.id === s.ids.grammar);
      expect(payload.steps.map((step) => step.blocks.map((block) => block.id))).toEqual([
        [original[grammarIndex + 1]!.id, original[grammarIndex + 2]!.id], [original[grammarIndex + 3]!.id, original[grammarIndex + 4]!.id],
      ]);
      // The summary section offers mixed_practice and the grammar section offers tricky_grammar, so both are eligible; the unknown value is dropped.
      expect(payload.followUps).toEqual(["tricky_grammar", "mixed_practice"]);
    });
    it("drops a follow-up no source in the lesson offers", async () => {
      // mixed_practice is offered only by the Summary and lesson-end sources, so it is ineligible in a lesson without them.
      const { generateLessonActivity } = await import("../src/lessonActivities/generate");
      const block = (text: string) => ({ ...blocks.paragraph(text) });
      const payload = await generateLessonActivity({
        env: { ...env, ...scriptedAi([guidedReply([[0], [1]], { followUps: ["mixed_practice", "tricky_grammar"] })]).env } as never, db: env.DB, userId: await seedUser("followup-user"), type: "guided_grammar", language: "nl",
        source: [], lessonGoal: null, blocks: [block("One."), block("Two.")], eligibleFollowUps: ["tricky_grammar"],
      });
      if (payload.type !== "guided_grammar") throw new Error("Expected guided_grammar.");
      expect(payload.followUps).toEqual(["tricky_grammar"]);
    });
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

describe("dialogue section activities", () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const openStory = (s: Setup, type: ActivityType, ai?: Ai, cookie = s.learner) => openActivity(cookie, s.base, s.descriptor(s.ids.story), type, ai);
  const storedPayload = async (s: Setup, type: string) => JSON.parse((await env.DB.prepare("SELECT payload FROM lesson_activities WHERE source_id = ? AND activity_type = ?").bind(s.ids.story, type).first<{ payload: string }>())!.payload) as Record<string, unknown>;
  const storedLines = async (s: Setup) => (await storedPayload(s, "read_aloud")).lines as Array<Record<string, unknown>>;
  const readAloud = (opened: Ready) => {
    const payload = opened.activity.payload;
    if (payload.type !== "read_aloud") throw new Error("Expected read aloud.");
    return payload.lines;
  };
  const textAnswer = (runId: string, itemId: string, text: string) => ({ runId, itemId, answer: { kind: "text", text }, inputMode: "typed", idempotencyKey: uuid() });
  const patch = (s: Setup, opened: Ready, body: unknown, cookie = s.learner) => call("PATCH", `${s.base}/${opened.activity.id}/run`, cookie, body);

  it("opens read aloud with no model call, no AI allowance and stable line IDs: the dialogue's turns only, with speakers", async () => {
    const s = await setup();
    const none = scriptedAi([]);
    const first = await readyOpen(await openStory(s, "read_aloud", none));
    expect(first.activity.generatedBy).toBeNull();
    const stored = await storedLines(s);
    expect(stored.map((line) => [line.speaker, line.dutchText])).toEqual([["Sofia", SOFIA_LINE], ["Pieter", PIETER_LINE]]);
    expect(stored.map((line) => line.referenceText)).toEqual(stored.map((line) => line.dutchText));
    const ids = stored.map((line) => line.id);
    expect(new Set(ids).size).toBe(2);
    const second = await readyOpen(await openStory(s, "read_aloud", none, s.rival));
    expect(second.activity.id).toBe(first.activity.id);
    expect((await storedLines(s)).map((line) => line.id)).toEqual(ids);
    expect(none.calls).toHaveLength(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM ai_usage")).toBe(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM ai_turn_reservations")).toBe(0);
  });

  it("serves read aloud even at a zero daily AI cap", async () => {
    const s = await setup();
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 });
    await readyOpen(await openStory(s, "read_aloud", scriptedAi([])));
  });

  it("refuses read aloud to anonymous, setup-incomplete and out-of-library requests, and for hidden lessons", async () => {
    const s = await setup();
    const body = { sourceId: s.ids.story, type: "read_aloud", expectedFingerprint: s.descriptor(s.ids.story).fingerprint };
    expect((await call("POST", `${s.base}/open`, null, body)).status).toBe(401);
    expect((await openStory(s, "read_aloud", undefined, s.newcomer)).status).toBe(403);
    expect((await openStory(s, "read_aloud", undefined, s.stranger)).status).toBe(404);
    expect((await openActivity(s.learner, `/api/courses/${s.courseId}/lessons/${s.unpublishedId}/activities`, s.descriptor(s.ids.story), "read_aloud")).status).toBe(404);
    expect((await openActivity(s.learner, `/api/courses/${s.draftCourseId}/lessons/${s.hiddenLessonId}/activities`, s.descriptor(s.ids.story), "read_aloud")).status).toBe(404);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activities WHERE activity_type = 'read_aloud'")).toBe(0);
  });

  it("reads every line without a reader, and only the chosen speaker's lines with one", async () => {
    const s = await setup();
    const opened = await readyOpen(await openStory(s, "read_aloud"));
    const [sofia, pieter] = readAloud(opened);
    const answers = `${s.base}/${opened.activity.id}/answers`;
    // No reader: both lines must be read before completion.
    expect((await call("POST", answers, s.learner, textAnswer(opened.run.id, sofia!.id, SOFIA_LINE))).status).toBe(200);
    expect(await errorCode(await patch(s, opened, { action: "complete" }))).toBe("ACTIVITY_INCOMPLETE");
    // Choosing Pieter starts over at his first line; Sofia's earlier answer does not count for him.
    const chosen = await patch(s, opened, { action: "set_reader", reader: "Pieter" });
    expect(activityRunPatchResponseSchema.parse(await chosen.json()).run).toMatchObject({ reader: "Pieter", cursor: 0, status: "active" });
    expect(await errorCode(await patch(s, opened, { action: "complete" }))).toBe("ACTIVITY_INCOMPLETE");
    const graded = activityAnswerResponseSchema.parse(await (await call("POST", answers, s.learner, textAnswer(opened.run.id, pieter!.id, "goedemorgen wat wilt u hebben"))).json());
    expect(graded).toMatchObject({ correct: true, reference: PIETER_LINE });
    const done = await patch(s, opened, { action: "complete" });
    expect(done.status).toBe(200);
    expect(activityRunPatchResponseSchema.parse(await done.json()).run).toMatchObject({ status: "completed", reader: "Pieter" });
    // A fresh read of the activity keeps the reader.
    const polled = activityStatusResponseSchema.parse(await (await call("GET", `${s.base}/${opened.activity.id}`, s.learner)).json());
    expect(polled.status === "ready" && polled.run.reader).toBe("Pieter");
  });

  it("refuses a reader the dialogue does not name, and from another account", async () => {
    const s = await setup();
    const opened = await readyOpen(await openStory(s, "read_aloud"));
    expect(await errorCode(await patch(s, opened, { action: "set_reader", reader: "Daan" }))).toBe("ACTIVITY_READER_INVALID");
    // Another account cannot set the reader of this run: it has no run of its own here.
    expect(await errorCode(await patch(s, opened, { action: "set_reader", reader: "Sofia" }, s.rival))).toBe("ACTIVITY_RUN_NOT_FOUND");
  });
});

describe("daily AI cap", () => {
  it("refuses a cache miss at the cap but still serves an already-ready activity", async () => {
    const s = await setup();
    const q = tricky();
    const ready = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));

    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 });
    const none = scriptedAi([]);
    const miss = await openActivity(s.learner, s.base, s.descriptor(s.ids.summary), "mixed_practice", none);
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

describe("read-aloud speech", () => {
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
  const speakBody = (opened: Ready, lineId: string, chunkIndex?: number) => ({ runId: opened.run.id, lineId, ...(chunkIndex === undefined ? {} : { chunkIndex }) });
  const turnNamed = (opened: Ready, speaker: string) => {
    const payload = opened.activity.payload;
    const line = payload.type === "read_aloud" ? payload.lines.find((candidate) => candidate.speaker === speaker) : undefined;
    if (!line) throw new Error(`No line by ${speaker}`);
    return line;
  };
  async function openReadAloud(s: Setup, cookie = s.learner) {
    return readyOpen(await openActivity(cookie, s.base, s.descriptor(s.ids.story), "read_aloud"));
  }
  async function castPieterAsNarrator(courseId: string) {
    await env.DB.prepare("UPDATE courses SET speech_cast = ? WHERE id = ?").bind(JSON.stringify({ Pieter: FENNA }), courseId).run();
  }

  afterEach(() => vi.restoreAllMocks());

  it("speaks another speaker's line in its course cast voice and serves the clip under the lesson's cache key", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openReadAloud(s);
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

  it("speaks a line without a cast entry in its speaker's positional cast voice", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openReadAloud(s);
    const bodies = stubAzure();
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Sofia").id), withSpeech());
    const hash = await speechClipHash({ voice: COLETTE, text: SOFIA_LINE, ipa: null });
    expect(await response.json()).toEqual({ status: "ready", url: clipUrl(hash) });
    expect(bodies[0]).toContain(`<voice name="${COLETTE}">`);
  });

  it("serves a repeated request from the cache, and a clip the lesson already holds, without synthesizing again", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openReadAloud(s);
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
    const opened = await openReadAloud(s);
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
    const opened = await openReadAloud(s);
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Sofia").id, 1), withSpeech());
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("ACTIVITY_CHUNK_INVALID");
  });

  it("answers 202 with a retry hint while another request holds the clip", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openReadAloud(s);
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
    const opened = await openReadAloud(s);
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
    const opened = await openReadAloud(s);
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 5 });
    const bodies = stubAzure();
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech());
    expect(response.status).toBe(429);
    expect(await errorCode(response)).toBe("SPEECH_DAILY_LIMIT");
    expect(bodies).toHaveLength(0);
  });

  it("answers 503 SPEECH_UNAVAILABLE without an Azure key, after the line is checked", async () => {
    const s = await setup();
    const opened = await openReadAloud(s);
    const bodies = stubAzure();
    const path = SPEAK(s.base, opened.activity.id);
    const unconfigured = await call("POST", path, s.learner, speakBody(opened, turnNamed(opened, "Pieter").id), withSpeech(false));
    expect(unconfigured.status).toBe(503);
    expect(await errorCode(unconfigured)).toBe("SPEECH_UNAVAILABLE");
    expect(await errorCode(await call("POST", path, s.learner, speakBody(opened, uuid()), withSpeech(false)))).toBe("ACTIVITY_LINE_NOT_FOUND");
    expect(bodies).toHaveLength(0);
  });

  it("answers 404 ACTIVITY_TURN_NOT_FOUND for a line ID the activity does not contain", async () => {
    const s = await setup();
    const opened = await openReadAloud(s);
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, uuid()), withSpeech());
    expect(response.status).toBe(404);
    expect(await errorCode(response)).toBe("ACTIVITY_LINE_NOT_FOUND");
  });

  it("refuses speech for an activity that is not read aloud", async () => {
    const s = await setup();
    const q = tricky();
    const opened = await readyOpen(await openActivity(s.learner, s.base, s.descriptor(s.ids.grammar), "tricky_grammar", scriptedAi([say(q.json)])));
    const response = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, { runId: opened.run.id, lineId: uuid() }, withSpeech());
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("ACTIVITY_ACTION_INVALID");
  });

  it("refuses a hidden, unpublished, mismatched, or stranger's request before reading the activity", async () => {
    const s = await setup();
    const opened = await openReadAloud(s);
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
    const opened = await openReadAloud(s);
    const rivalOpened = await openReadAloud(s, s.rival);
    const lineId = turnNamed(opened, "Pieter").id;
    const denied = await call("POST", SPEAK(s.base, opened.activity.id), s.rival, { runId: opened.run.id, lineId }, withSpeech());
    expect(denied.status).toBe(404);
    expect(await errorCode(denied)).toBe("ACTIVITY_RUN_NOT_FOUND");
    const bodies = stubAzure();
    const own = await call("POST", SPEAK(s.base, opened.activity.id), s.rival, { runId: rivalOpened.run.id, lineId }, withSpeech());
    expect(own.status).toBe(200);
    expect(bodies).toHaveLength(1);
  });

  it("serves ready audio to an archived course without a run, and makes no new audio there", async () => {
    const s = await setup();
    await castPieterAsNarrator(s.courseId);
    const opened = await openReadAloud(s);
    const bodies = stubAzure();
    const pieter = turnNamed(opened, "Pieter").id;
    const warm = await call("POST", SPEAK(s.base, opened.activity.id), s.learner, speakBody(opened, pieter), withSpeech());
    const warmBody = await warm.json();
    await env.DB.prepare("UPDATE courses SET status = 'archived' WHERE id = ?").bind(s.courseId).run();
    // An archived course is visible to its owner, who has no run of this activity, so the read-only path answers from the cache.
    const readOnly = await call("POST", SPEAK(s.base, opened.activity.id), s.owner, { runId: crypto.randomUUID(), lineId: pieter }, withSpeech());
    expect(readOnly.status).toBe(200);
    expect(await readOnly.json()).toEqual(warmBody);
    // Audio that is not made yet is not made for an archived course.
    const fresh = await call("POST", SPEAK(s.base, opened.activity.id), s.owner, { runId: crypto.randomUUID(), lineId: turnNamed(opened, "Sofia").id }, withSpeech());
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

// Guided grammar answers credit lesson reading (docs/lesson-activities.md progress): the first answer of a step moves the saved
// position to the step's last block, forward only, and completion reports the metrics the activity moved.
describe("metrics and progress write", () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const guidedReply = (metrics: string[] = ["lesson_grammar"]) => say(JSON.stringify({
    steps: [[0, 1], [2, 3]].map((chunks, index) => ({ chunks, question: { kind: "choice", prompt: `Step ${index + 1}?`, options: ["Alpha", "Beta", "Gamma"], correctIndex: 0, explanation: "Because." } })), metrics,
  }));
  async function openGuided(s: Setup, cookie = s.learner, metrics?: string[]) {
    const opened = await readyOpen(await openActivity(cookie, s.base, s.descriptor(s.ids.grammar), "guided_grammar", scriptedAi([guidedReply(metrics)])));
    const payload = opened.activity.payload;
    if (payload.type !== "guided_grammar") throw new Error("Expected guided_grammar.");
    return { opened, steps: payload.steps.map((step) => ({ id: step.question.id, option: step.question.options[0]!.id })) };
  }
  const answer = (s: Setup, cookie: string, opened: Ready, step: { id: string; option: string }, runId = opened.run.id, key = uuid()) =>
    call("POST", `${s.base}/${opened.activity.id}/answers`, cookie, answerBody(runId, step.id, step.option, key));
  const positions = (s: Setup) => countRows("SELECT COUNT(*) AS n FROM course_lesson_positions WHERE lesson_id = ?", s.lessonId);
  const snapshotOf = async (runId: string) => JSON.parse((await env.DB.prepare("SELECT metrics_before AS snapshot FROM lesson_activity_runs WHERE id = ?").bind(runId).first<{ snapshot: string }>())!.snapshot) as Record<string, number>;

  it("credits reading to the step's last block on the first answer only, and never moves the position back", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s);
    expect(await positions(s)).toBe(0);
    const key = uuid();
    expect((await answer(s, s.learner, opened, steps[0]!, opened.run.id, key)).status).toBe(200);
    const first = await env.DB.prepare("SELECT step_index AS stepIndex, reading_reached AS reached, reading_total AS total FROM course_lesson_positions WHERE lesson_id = ?").bind(s.lessonId).first<{ stepIndex: number; reached: number; total: number }>();
    expect(first!.reached).toBeGreaterThan(0);
    expect(first!.reached).toBeLessThan(first!.total);
    // A retry and a re-answer are not a first submission: no second write.
    await env.DB.prepare("UPDATE course_lesson_positions SET updated_at = 1 WHERE lesson_id = ?").bind(s.lessonId).run();
    expect((await answer(s, s.learner, opened, steps[0]!, opened.run.id, key)).status).toBe(200);
    expect((await answer(s, s.learner, opened, steps[0]!)).status).toBe(200);
    expect(await countRows("SELECT COUNT(*) AS n FROM course_lesson_positions WHERE lesson_id = ? AND updated_at = 1", s.lessonId)).toBe(1);

    // Move the saved position further on through the position route (the last example, short of the lesson's end): a later guided answer leaves it where it is.
    const lesson = await readLesson(lessonPath(s.groupId, s.courseId, s.lessonId), s.owner);
    const lastKey = lesson.draft!.document.blocks.filter((block) => block.type === "example").at(-1)!.id;
    const put = await call("PUT", `${lessonPath(s.groupId, s.courseId, s.lessonId)}/position`, s.learner, { stepKey: lastKey });
    expect(put.status).toBe(200);
    const end = await env.DB.prepare("SELECT step_index AS stepIndex, step_key AS stepKey FROM course_lesson_positions WHERE lesson_id = ?").bind(s.lessonId).first<{ stepIndex: number; stepKey: string }>();
    expect(end!.stepIndex).toBeGreaterThan(first!.stepIndex);
    await answer(s, s.learner, opened, steps[0]!, opened.run.id);
    expect(await env.DB.prepare("SELECT step_index AS stepIndex, step_key AS stepKey FROM course_lesson_positions WHERE lesson_id = ?").bind(s.lessonId).first()).toEqual(end);
  });

  it("completes the lesson only by its normal rule: partial steps do not", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s);
    for (const step of steps) expect((await answer(s, s.learner, opened, step)).status).toBe(200);
    expect(await countRows("SELECT COUNT(*) AS n FROM course_lesson_completions WHERE lesson_id = ?", s.lessonId)).toBe(0);
    expect((await env.DB.prepare("SELECT reading_reached AS reached, reading_total AS total FROM course_lesson_positions WHERE lesson_id = ?").bind(s.lessonId).first<{ reached: number; total: number }>())!.reached).toBeLessThan(10);
  });

  it("refuses another account's run for answers and writes no progress", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s);
    const stolen = await answer(s, s.rival, opened, steps[0]!);
    expect(stolen.status).toBe(404);
    expect(await errorCode(stolen)).toBe("ACTIVITY_RUN_NOT_FOUND");
    expect(await positions(s)).toBe(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_answers WHERE run_id = ?", opened.run.id)).toBe(0);
    const patched = await call("PATCH", `${s.base}/${opened.activity.id}/run`, s.rival, { action: "complete" });
    expect(patched.status).toBe(404);
  });

  it("snapshots the metrics when a run is created and again when it restarts, and returns before and after on completion", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s, s.learner, ["lesson_share", "lesson_reading", "lesson_grammar"]);
    expect(await snapshotOf(opened.run.id)).toEqual({ lesson_share: 0, lesson_reading: 0, lesson_grammar: 0, lesson_activities: 0 });
    for (const step of steps) await answer(s, s.learner, opened, step);
    const patch = (body: unknown) => call("PATCH", `${s.base}/${opened.activity.id}/run`, s.learner, body);
    const completed = activityRunPatchResponseSchema.parse(await (await patch({ action: "complete" })).json());
    expect(completed.metrics!.map((metric) => metric.key)).toEqual(["lesson_share", "lesson_reading", "lesson_grammar"]);
    for (const metric of completed.metrics!) expect(metric.before).toBe(0);
    const byKey = Object.fromEntries(completed.metrics!.map((metric) => [metric.key, metric.after]));
    expect(byKey.lesson_reading).toBeGreaterThan(0);
    expect(byKey.lesson_share).toBeGreaterThan(0);
    expect(byKey.lesson_grammar).toBeGreaterThan(0);
    // Only completion carries metrics; a restart takes a new snapshot from the state at that moment.
    const restarted = activityRunPatchResponseSchema.parse(await (await patch({ action: "restart" })).json());
    expect(restarted.metrics).toBeUndefined();
    const snapshot = await snapshotOf(opened.run.id);
    expect(snapshot.lesson_reading).toBe(byKey.lesson_reading);
    expect(snapshot.lesson_grammar).toBe(0);
  });

  it("omits a metric key when the run has no snapshot", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s);
    for (const step of steps) await answer(s, s.learner, opened, step);
    await env.DB.prepare("UPDATE lesson_activity_runs SET metrics_before = NULL WHERE id = ?").bind(opened.run.id).run();
    const completed = activityRunPatchResponseSchema.parse(await (await call("PATCH", `${s.base}/${opened.activity.id}/run`, s.learner, { action: "complete" })).json());
    expect(completed.metrics).toEqual([]);
  });

  it("writes no progress in an archived course, for an existing run or an unsaved one", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s, s.owner);
    await env.DB.prepare("UPDATE courses SET status = 'archived' WHERE id = ?").bind(s.courseId).run();
    expect((await answer(s, s.owner, opened, steps[0]!)).status).toBe(200);
    expect(await positions(s)).toBe(0);
    expect(await countRows("SELECT COUNT(*) AS n FROM lesson_activity_answers WHERE run_id = ?", opened.run.id)).toBe(0);
    // A viewer with no run gets an unsaved (ephemeral) one: answers are graded, nothing is stored.
    const ephemeral = await readyOpen(await openActivity(s.owner, s.base, s.descriptor(s.ids.grammar), "guided_grammar"));
    expect(ephemeral.ephemeral).toBe(true);
    expect((await answer(s, s.owner, ephemeral, steps[0]!)).status).toBe(200);
    expect(await positions(s)).toBe(0);
  });

  it("refuses an unknown run without writing progress when the course is not archived", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s);
    const unknown = await answer(s, s.learner, opened, steps[0]!, uuid());
    expect(unknown.status).toBe(404);
    expect(await positions(s)).toBe(0);
  });

  it("refuses anonymous, setup-incomplete, unpublished and hidden requests on the answer and run routes", async () => {
    const s = await setup();
    const { opened, steps } = await openGuided(s);
    const body = answerBody(opened.run.id, steps[0]!.id, steps[0]!.option);
    expect((await call("POST", `${s.base}/${opened.activity.id}/answers`, null, body)).status).toBe(401);
    expect((await call("PATCH", `${s.base}/${opened.activity.id}/run`, null, { action: "complete" })).status).toBe(401);
    for (const [method, tail, payload] of [["POST", "answers", body], ["PATCH", "run", { action: "complete" }]] as const) {
      const refused = await call(method, `${s.base}/${opened.activity.id}/${tail}`, s.newcomer, payload);
      expect(refused.status).toBe(403);
      expect(await errorCode(refused)).toBe("ONBOARDING_REQUIRED");
      const unpublished = await call(method, `/api/courses/${s.courseId}/lessons/${s.unpublishedId}/activities/${opened.activity.id}/${tail}`, s.learner, payload);
      expect(unpublished.status).toBe(404);
      const hidden = await call(method, `/api/courses/${s.draftCourseId}/lessons/${s.hiddenLessonId}/activities/${opened.activity.id}/${tail}`, s.learner, payload);
      expect(hidden.status).toBe(404);
    }
    expect(await positions(s)).toBe(0);
  });
});
