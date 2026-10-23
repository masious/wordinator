import { env } from "cloudflare:test";
import { speechNarrator } from "@wordinator/contracts";
import { DEFAULT_AI_SETTINGS } from "@wordinator/contracts/ai";
import { lessonProgressResponseSchema } from "@wordinator/contracts";
import { spokenText } from "@wordinator/contracts/speech";
import { aiPracticeAnswerResponseSchema, lessonAiPracticesResponseSchema, type AiPracticeContent, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { beforeEach, describe, expect, it } from "vitest";
import { writeAiSettings } from "../src/ai";
import { hashSpeechItems } from "../src/speech";
import { saveAiPractice } from "../src/tutor/aiPractices";
import { blocks, coursePath, documentOf, errorCode, lessonPath, publishLesson, readLesson, request, resetDatabase, saveDraft } from "./courseApi";
import { call, callTool, newConversation, readEvents, say, scriptedAi, seedLibrary } from "./tutorApi";

// AI practices (C14h, docs/courses.md#ai-practices): saving with anchor validation, the lesson page's read, answer, speech, and
// removal routes, counts, and lesson deletion. Model calls go to a scripted model endpoint only.

beforeEach(resetDatabase);

const count = async (sql: string, ...values: unknown[]) => (await env.DB.prepare(sql).bind(...values).first<{ n: number }>())!.n;
const choice = (question = "Wat is een huis?"): AiPracticeContent => ({ kind: "choice", payload: { question, options: ["house", "mouse", "horse"], correct: 0 } });

async function setup() {
  const library = await seedLibrary();
  const { groupId, course, lessons } = library;
  const firstPath = lessonPath(groupId, course.id, lessons.first.id);
  const secondPath = lessonPath(groupId, course.id, lessons.second.id);
  const firstDoc = (await readLesson(firstPath, library.owner)).document!;
  const [heading, , example] = firstDoc.blocks.map((block) => block.id) as [string, string, string];
  const secondFirstBlock = (await readLesson(secondPath, library.owner)).document!.blocks[0]!.id;
  const save = async (practice: AiPracticeContent, tags: Array<{ lessonId: string; afterBlockId: string; courseId?: string }>, now?: number) => {
    const saved = await saveAiPractice(env.DB, {
      userId: library.learnerId, conversationId: crypto.randomUUID(), practice, now,
      lessons: tags.map((tag) => ({ courseId: tag.courseId ?? course.id, lessonId: tag.lessonId, afterBlockId: tag.afterBlockId })),
    });
    if (!saved.ok) throw new Error(saved.error);
    return saved.practiceId;
  };
  return { ...library, firstPath, secondPath, anchors: { heading, example, second: secondFirstBlock }, save };
}

const practicesOf = async (path: string, cookie: string) => {
  const response = await request(`${path}/ai-practices`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return lessonAiPracticesResponseSchema.parse(await response.json());
};

async function makeContributor(groupId: string, courseId: string, owner: string, helper: string, helperId: string) {
  const path = coursePath(groupId, courseId);
  expect((await request(`${path}/contributors`, helper, {})).status).toBe(201);
  expect((await request(`${path}/contributors/${helperId}`, owner, { decision: "accept" }, "PATCH")).status).toBe(200);
}

describe("saving", () => {
  it("validates every anchor against the published document and stores nothing on refusal", async () => {
    const s = await setup();
    const attempt = (lessonId: string, afterBlockId: string) => saveAiPractice(env.DB, {
      userId: s.learnerId, conversationId: crypto.randomUUID(), practice: choice(), lessons: [{ lessonId, courseId: s.course.id, afterBlockId }],
    });
    expect(await attempt(s.lessons.first.id, crypto.randomUUID())).toEqual({ ok: false, error: "ANCHOR_NOT_FOUND" });
    // A block only in the draft is not an anchor until it is published.
    const draftOnly = blocks.paragraph("Only in the draft");
    const current = await readLesson(s.firstPath, s.owner);
    await saveDraft(s.firstPath, s.owner, { ...current.draft!.document, blocks: [...current.draft!.document.blocks, draftOnly] }, current.draft!.version);
    expect(await attempt(s.lessons.first.id, draftOnly.id)).toEqual({ ok: false, error: "ANCHOR_NOT_FOUND" });
    // An unpublished lesson has no anchors; neither does a valid block of another lesson.
    const unpublishedBlock = (await readLesson(lessonPath(s.groupId, s.course.id, s.lessons.unpublished.id), s.owner)).draft!.document.blocks[0]!.id;
    expect(await attempt(s.lessons.unpublished.id, unpublishedBlock)).toEqual({ ok: false, error: "ANCHOR_NOT_FOUND" });
    expect(await attempt(s.lessons.second.id, s.anchors.example)).toEqual({ ok: false, error: "ANCHOR_NOT_FOUND" });
    // One bad tag refuses the whole practice.
    const mixed = await saveAiPractice(env.DB, {
      userId: s.learnerId, conversationId: crypto.randomUUID(), practice: choice(),
      lessons: [{ lessonId: s.lessons.first.id, courseId: s.course.id, afterBlockId: s.anchors.example }, { lessonId: s.lessons.second.id, courseId: s.course.id, afterBlockId: crypto.randomUUID() }],
    });
    expect(mixed).toEqual({ ok: false, error: "ANCHOR_NOT_FOUND" });
    expect(await count("SELECT COUNT(*) AS n FROM ai_practices")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM ai_practice_lessons")).toBe(0);
  });

  it("tags several lessons in one batch and positions each tag after practices sharing its anchor", async () => {
    const s = await setup();
    const first = await s.save(choice("Een"), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const shared = await s.save(choice("Twee"), [
      { lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }, { lessonId: s.lessons.second.id, afterBlockId: s.anchors.second },
      { lessonId: s.lessons.first.id, afterBlockId: s.anchors.heading },
    ]);
    const tags = await env.DB.prepare("SELECT practice_id AS practiceId, lesson_id AS lessonId, after_block_id AS afterBlockId, position FROM ai_practice_lessons ORDER BY lesson_id, position").all();
    expect(tags.results).toEqual(expect.arrayContaining([
      { practiceId: first, lessonId: s.lessons.first.id, afterBlockId: s.anchors.example, position: 0 },
      { practiceId: shared, lessonId: s.lessons.first.id, afterBlockId: s.anchors.example, position: 1 },
      { practiceId: shared, lessonId: s.lessons.second.id, afterBlockId: s.anchors.second, position: 0 },
    ]));
    expect(tags.results).toHaveLength(3);
    expect(await env.DB.prepare("SELECT kind, created_by_user_id AS userId FROM ai_practices WHERE id = ?").bind(shared).first()).toEqual({ kind: "choice", userId: s.learnerId });
    expect((await practicesOf(s.secondPath, s.learner)).practices.map((practice) => practice.id)).toEqual([shared]);
  });

  it("succeeds end to end through the tutor's save_ai_practice after confirmation", async () => {
    const s = await setup();
    const practice = { kind: "choice", payload: { question: "Wat is een huis?", options: ["house", "mouse", "horse"], correct: 0 } };
    const ai = scriptedAi([callTool("save_ai_practice", { practice, lessons: [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }] }), say("Saved.")]);
    const conversationId = await newConversation(s.learner);
    const asked = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, s.learner, { text: "Save it" }, { ...ai.env }));
    const card = asked.find((event): event is Extract<TutorStreamEvent, { type: "confirmation" }> => event.type === "confirmation")!.part;
    expect(await count("SELECT COUNT(*) AS n FROM ai_practices")).toBe(0);
    const confirmed = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${card.toolCallId}/respond`, s.learner, { type: "confirmation", confirmed: true }, { ...ai.env }));
    expect(confirmed.find((event) => event.type === "answered")).toMatchObject({ part: { answer: "confirmed", outcome: { ok: true, error: null } } });
    expect(await env.DB.prepare("SELECT conversation_id AS conversationId, created_by_user_id AS userId FROM ai_practices").first()).toEqual({ conversationId, userId: s.learnerId });
    const read = await practicesOf(s.firstPath, s.rival);
    expect(read.practices).toEqual([expect.objectContaining({ kind: "choice", afterBlockId: s.anchors.example, view: { kind: "choice", question: "Wat is een huis?", options: ["house", "mouse", "horse"] } })]);
  });

  it("reports an anchor that is not in the published document to the tutor", async () => {
    const s = await setup();
    const ai = scriptedAi([callTool("save_ai_practice", { practice: choice(), lessons: [{ lessonId: s.lessons.first.id, afterBlockId: crypto.randomUUID() }] }), say("Sorry.")]);
    const conversationId = await newConversation(s.learner);
    const asked = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/messages`, s.learner, { text: "Save it" }, { ...ai.env }));
    const card = asked.find((event): event is Extract<TutorStreamEvent, { type: "confirmation" }> => event.type === "confirmation")!.part;
    const confirmed = await readEvents(await call("POST", `/api/ai/conversations/${conversationId}/tool-calls/${card.toolCallId}/respond`, s.learner, { type: "confirmation", confirmed: true }, { ...ai.env }));
    expect(confirmed.find((event) => event.type === "answered")).toMatchObject({ part: { outcome: { ok: false, error: "ANCHOR_NOT_FOUND" } } });
    expect(await count("SELECT COUNT(*) AS n FROM ai_practices")).toBe(0);
  });
});

describe("lesson page read", () => {
  it("places practices after their anchors in reading order, missing anchors last, and never sends references", async () => {
    const s = await setup();
    const atExample = await s.save({ kind: "fill_in", payload: { prompt: "Ik … in Utrecht.", answers: ["woon"] } }, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }], 1);
    const atHeading = await s.save({ kind: "translate", payload: { source: "I live in Utrecht.", reference: "Ik woon in Utrecht." } }, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.heading }], 2);
    const dictation = await s.save({ kind: "dictation", payload: { sentence: "Goedemorgen allemaal", translation: "Good morning, everyone" } }, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }], 3);
    const order = await s.save({ kind: "word_order", payload: { chunks: ["Ik", "woon", "in", "Utrecht"] } }, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.heading }], 4);
    let read = await practicesOf(s.firstPath, s.learner);
    expect(read.canRemove).toBe(false);
    expect(read.practices.map((practice) => [practice.id, practice.afterBlockId])).toEqual([
      [atHeading, s.anchors.heading], [order, s.anchors.heading], [atExample, s.anchors.example], [dictation, s.anchors.example],
    ]);
    const raw = JSON.stringify(read);
    for (const secret of ["Ik woon in Utrecht.", "Goedemorgen", "reference", "answers", "correct"]) expect(raw).not.toContain(secret);
    expect(read.practices.find((practice) => practice.id === dictation)!.view).toEqual({ kind: "dictation", translation: "Good morning, everyone" });
    // Word order chunks are shuffled the same way on every read.
    const chunks = read.practices.find((practice) => practice.id === order)!.view;
    expect((await practicesOf(s.firstPath, s.learner)).practices.find((practice) => practice.id === order)!.view).toEqual(chunks);

    // The owner publishes the lesson without its heading: those practices move to the end, in their stored order.
    const current = await readLesson(s.firstPath, s.owner);
    const saved = await saveDraft(s.firstPath, s.owner, { ...current.draft!.document, blocks: current.draft!.document.blocks.slice(1) }, current.draft!.version);
    await publishLesson(s.firstPath, s.owner, saved.draftVersion);
    read = await practicesOf(s.firstPath, s.owner);
    expect(read.canRemove).toBe(true);
    expect(read.practices.map((practice) => [practice.id, practice.afterBlockId])).toEqual([
      [atExample, s.anchors.example], [dictation, s.anchors.example], [atHeading, null], [order, null],
    ]);
  });

  it("follows the lesson read's visibility", async () => {
    const s = await setup();
    const id = await s.save(choice(), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const unpublished = lessonPath(s.groupId, s.course.id, s.lessons.unpublished.id);
    expect(await errorCode(await request(`${unpublished}/ai-practices`, s.learner))).toBe("LESSON_NOT_FOUND");
    expect((await practicesOf(unpublished, s.owner)).practices).toEqual([]);
    const hiddenCourse = await env.DB.prepare("SELECT course_id AS courseId FROM course_lessons WHERE id = ?").bind(s.lessons.hidden.id).first<{ courseId: string }>();
    expect(await errorCode(await request(`${lessonPath(s.groupId, hiddenCourse!.courseId, s.lessons.hidden.id)}/ai-practices`, s.learner))).toBe("COURSE_NOT_FOUND");
    // Another account outside the library is refused before the course is resolved.
    const foreign = await request(`${s.firstPath}/ai-practices`, s.stranger);
    expect([403, 404]).toContain(foreign.status);
    const answer = await request(`${s.firstPath}/ai-practices/${id}/answer`, s.stranger, { answer: { kind: "choice", choice: 0 } });
    expect([403, 404]).toContain(answer.status);
    // A practice is reached only through a lesson it is tagged to.
    expect(await errorCode(await request(`${s.secondPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "choice", choice: 0 } }))).toBe("AI_PRACTICE_NOT_FOUND");
    expect(await errorCode(await request(`${s.firstPath}/ai-practices/${crypto.randomUUID()}/answer`, s.learner, { answer: { kind: "choice", choice: 0 } }))).toBe("AI_PRACTICE_NOT_FOUND");
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);
  });

  it("counts tagged practices in lesson reads, the course read, and the Progress tab", async () => {
    const s = await setup();
    expect((await readLesson(s.firstPath, s.learner)).aiPracticeCount).toBe(0);
    await s.save(choice("Een"), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }, { lessonId: s.lessons.second.id, afterBlockId: s.anchors.second }]);
    await s.save(choice("Twee"), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.heading }]);
    expect((await readLesson(s.firstPath, s.learner)).aiPracticeCount).toBe(2);
    expect((await readLesson(s.secondPath, s.learner)).aiPracticeCount).toBe(1);
    const progress = lessonProgressResponseSchema.parse(await (await request(`${coursePath(s.groupId, s.course.id)}/progress/lessons`, s.learner)).json());
    expect(Object.fromEntries(progress.lessons.map((lesson) => [lesson.lessonId, lesson.aiPracticeCount]))).toEqual({ [s.lessons.first.id]: 2, [s.lessons.second.id]: 1 });
  });
});

describe("answering", () => {
  it("grades in the API and records an ai_practice attempt and reviews under the lesson", async () => {
    const s = await setup();
    const practice: AiPracticeContent = {
      kind: "choice", payload: { question: "Wat is een huis?", options: ["house", "mouse", "horse"], correct: 0, lessonId: s.lessons.second.id, words: [{ lessonId: s.lessons.first.id, wordId: s.words.huis.id }] },
    };
    const id = await s.save(practice, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const right = await request(`${s.firstPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "choice", choice: 0 } });
    expect(right.status).toBe(200);
    expect(aiPracticeAnswerResponseSchema.parse(await right.json())).toMatchObject({ recorded: true, grade: { correct: true, matched: true, reference: "house" } });
    const wrong = aiPracticeAnswerResponseSchema.parse(await (await request(`${s.firstPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "choice", choice: 2 } })).json());
    expect(wrong.grade).toMatchObject({ correct: false, reference: "house" });
    const attempts = await env.DB.prepare(
      "SELECT user_id AS userId, lesson_id AS lessonId, practice_kind AS kind, practice_id AS practiceId, source, matched, conversation_id AS conversationId, answer FROM practice_attempts ORDER BY created_at, answer",
    ).all();
    expect(attempts.results).toEqual(expect.arrayContaining([
      { userId: s.learnerId, lessonId: s.lessons.first.id, kind: "ai", practiceId: id, source: "ai_practice", matched: 1, conversationId: null, answer: "house" },
      { userId: s.learnerId, lessonId: s.lessons.first.id, kind: "ai", practiceId: id, source: "ai_practice", matched: 0, conversationId: null, answer: "horse" },
    ]));
    const reviews = await env.DB.prepare("SELECT direction, result, source, word_id AS wordId FROM word_reviews WHERE user_id = ? ORDER BY created_at, result DESC").bind(s.learnerId).all();
    expect(reviews.results).toEqual(expect.arrayContaining([
      { direction: "understand", result: "got", source: "ai_practice", wordId: s.words.huis.id },
      { direction: "understand", result: "again", source: "ai_practice", wordId: s.words.huis.id },
    ]));
    expect(await count("SELECT COUNT(*) AS n FROM word_memory WHERE user_id = ?", s.learnerId)).toBe(1);
    // AI practices count toward no practice progress.
    expect(await count("SELECT COUNT(*) AS n FROM course_practice_progress")).toBe(0);
  });

  it("shows a saved practice's word hints from the lesson index and records the hints the learner opened", async () => {
    const s = await setup();
    const huis = { lessonId: s.lessons.first.id, wordId: s.words.huis.id };
    const practice: AiPracticeContent = { kind: "translate", payload: { source: "the house", reference: "het huis", words: [huis], hints: [{ ...huis, cue: "the house" }] } };
    const id = await s.save(practice, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const listed = await practicesOf(s.firstPath, s.learner);
    expect(listed.practices[0]!.view).toEqual({ kind: "translate", source: "the house", hints: [{ ...huis, cue: "the house", term: "het huis", meaning: "meaning of het huis", forms: null }] });
    const answered = await request(`${s.firstPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "translate", text: "het huis", hintsUsed: [huis] } });
    expect(aiPracticeAnswerResponseSchema.parse(await answered.json())).toMatchObject({ grade: { correct: true } });
    expect(await count("SELECT hints_used AS n FROM practice_attempts WHERE user_id = ?", s.learnerId)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM word_reviews WHERE user_id = ? AND result = 'again'", s.learnerId)).toBe(1);
  });

  it("refuses answers that do not fit the practice", async () => {
    const s = await setup();
    const id = await s.save(choice(), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    expect(await errorCode(await request(`${s.firstPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "choice", choice: 3 } }))).toBe("ANSWER_INVALID");
    expect(await errorCode(await request(`${s.firstPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "translate", text: "huis" } }))).toBe("ANSWER_INVALID");
    expect((await request(`${s.firstPath}/ai-practices/${id}/answer`, s.learner, { answer: { kind: "choice", choice: 0 }, matched: true })).status).toBe(400);
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);
  });

  it("asks the model judge for an unmatched open answer and degrades to the comparison without it", async () => {
    const s = await setup();
    const id = await s.save({ kind: "translate", payload: { source: "I live in Utrecht.", reference: "Ik woon in Utrecht." } }, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const path = `${s.firstPath}/ai-practices/${id}/answer`;
    const answer = { answer: { kind: "translate", text: "In Utrecht woon ik." } };
    const ai = scriptedAi([say('{"verdict": "acceptable", "note": "Inversion is fine."}')]);
    const judged = aiPracticeAnswerResponseSchema.parse(await (await call("POST", path, s.learner, answer, { ...ai.env })).json());
    expect(judged.grade).toMatchObject({ correct: true, matched: false, verdict: "acceptable", note: "Inversion is fine.", reference: "Ik woon in Utrecht." });
    expect(JSON.stringify(ai.calls[0])).toContain("In Utrecht woon ik.");
    expect(await env.DB.prepare("SELECT turn_start AS turnStart, conversation_id AS conversationId, ok FROM ai_usage").first()).toEqual({ turnStart: 0, conversationId: null, ok: 1 });
    // A matching answer never reaches the model.
    const matched = aiPracticeAnswerResponseSchema.parse(await (await call("POST", path, s.learner, { answer: { kind: "translate", text: "ik woon in utrecht" } }, { ...ai.env })).json());
    expect(matched.grade).toMatchObject({ correct: true, matched: true, verdict: null });
    // Without a provider the answer is stored without a verdict and not accepted.
    const unavailable = aiPracticeAnswerResponseSchema.parse(await (await request(path, s.learner, answer)).json());
    expect(unavailable).toMatchObject({ recorded: true, grade: { correct: false, matched: false, verdict: null } });
    // At the daily turn cap the judge is skipped.
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailyTurnCap: 0 });
    const capped = scriptedAi([say('{"verdict": "acceptable", "note": null}')]);
    const skipped = aiPracticeAnswerResponseSchema.parse(await (await call("POST", path, s.learner, answer, { ...capped.env })).json());
    expect(skipped.grade).toMatchObject({ correct: false, verdict: null });
    expect(capped.calls).toHaveLength(0);
    const verdicts = await env.DB.prepare("SELECT ai_verdict AS verdict, ai_note AS note FROM practice_attempts ORDER BY created_at").all();
    expect(verdicts.results).toEqual(expect.arrayContaining([{ verdict: "acceptable", note: "Inversion is fine." }, { verdict: null, note: null }]));
    expect(verdicts.results).toHaveLength(4);
  });

  it("grades but records nothing in an archived course, where removal is refused", async () => {
    const s = await setup();
    const id = await s.save(choice(), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    expect((await request(`${coursePath(s.groupId, s.course.id)}/archive`, s.owner, {})).status).toBe(200);
    const read = await practicesOf(s.firstPath, s.owner);
    expect(read).toMatchObject({ canRemove: false, practices: [{ id }] });
    const graded = aiPracticeAnswerResponseSchema.parse(await (await request(`${s.firstPath}/ai-practices/${id}/answer`, s.owner, { answer: { kind: "choice", choice: 0 } })).json());
    expect(graded).toMatchObject({ recorded: false, grade: { correct: true } });
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);
    expect(await errorCode(await request(`${s.firstPath}/ai-practices/${id}`, s.owner, undefined, "DELETE"))).toBe("COURSE_ARCHIVED");
    expect(await count("SELECT COUNT(*) AS n FROM ai_practice_lessons")).toBe(1);
  });
});

describe("removal", () => {
  it("lets the owner and active contributors remove a tag, deleting the practice with its last tag", async () => {
    const s = await setup();
    const id = await s.save(choice(), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }, { lessonId: s.lessons.second.id, afterBlockId: s.anchors.second }]);
    const remove = (path: string, cookie: string) => request(`${path}/ai-practices/${id}`, cookie, undefined, "DELETE");
    // A learner of the lesson, and an account outside the library, are refused.
    const learner = await remove(s.firstPath, s.learner);
    expect(learner.status).toBe(403);
    expect(await errorCode(learner)).toBe("COURSE_EDIT_FORBIDDEN");
    expect([403, 404]).toContain((await remove(s.firstPath, s.stranger)).status);
    expect(await count("SELECT COUNT(*) AS n FROM ai_practice_lessons")).toBe(2);

    await makeContributor(s.groupId, s.course.id, s.owner, s.rival, s.rivalId);
    expect((await practicesOf(s.firstPath, s.rival)).canRemove).toBe(true);
    expect((await remove(s.firstPath, s.rival)).status).toBe(200);
    expect(await errorCode(await remove(s.firstPath, s.rival))).toBe("AI_PRACTICE_NOT_FOUND");
    expect(await count("SELECT COUNT(*) AS n FROM ai_practices")).toBe(1);
    expect((await practicesOf(s.firstPath, s.learner)).practices).toEqual([]);
    expect((await remove(s.secondPath, s.owner)).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM ai_practices")).toBe(0);
  });

  it("removes a deleted lesson's tags and the practices left without tags", async () => {
    const s = await setup();
    const only = await s.save(choice("Een"), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const shared = await s.save(choice("Twee"), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.heading }, { lessonId: s.lessons.second.id, afterBlockId: s.anchors.second }]);
    expect((await request(`${s.firstPath}/ai-practices/${only}/answer`, s.learner, { answer: { kind: "choice", choice: 0 } })).status).toBe(200);
    expect((await request(s.firstPath, s.owner, undefined, "DELETE")).status).toBe(200);
    expect((await env.DB.prepare("SELECT id FROM ai_practices").all<{ id: string }>()).results.map((row) => row.id)).toEqual([shared]);
    expect((await env.DB.prepare("SELECT lesson_id AS lessonId FROM ai_practice_lessons").all()).results).toEqual([{ lessonId: s.lessons.second.id }]);
    expect(await count("SELECT COUNT(*) AS n FROM practice_attempts")).toBe(0);
    expect((await readLesson(s.secondPath, s.learner)).aiPracticeCount).toBe(1);
  });
});

describe("dictation speech", () => {
  const speechEnv = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "germanywestcentral" };

  it("speaks the stored sentence of a dictation practice, metered with surface ai_practice", async () => {
    const s = await setup();
    const dictation = await s.save({ kind: "dictation", payload: { sentence: "Goedemorgen allemaal" } }, [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const other = await s.save(choice(), [{ lessonId: s.lessons.first.id, afterBlockId: s.anchors.example }]);
    const path = `${s.firstPath}/ai-practices/${dictation}/speech`;
    expect(await errorCode(await call("POST", path, s.learner))).toBe("SPEECH_UNAVAILABLE");
    expect(await errorCode(await call("POST", `${s.firstPath}/ai-practices/${other}/speech`, s.learner, undefined, speechEnv))).toBe("SPAN_NOT_FOUND");
    expect(await errorCode(await call("POST", `${s.secondPath}/ai-practices/${dictation}/speech`, s.learner, undefined, speechEnv))).toBe("AI_PRACTICE_NOT_FOUND");
    const [item] = await hashSpeechItems([{ key: "x", voice: speechNarrator("nl"), text: spokenText("Goedemorgen allemaal"), ipa: null }]);
    await env.DB.prepare("INSERT INTO speech_clips (hash, voice, characters, status, attempts, created_at, updated_at) VALUES (?, ?, 20, 'ready', 1, 0, 0)").bind(item!.hash, speechNarrator("nl")).run();
    const response = await call("POST", path, s.learner, undefined, speechEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: `https://wordinator.test/api/media/speech/${item!.hash}.mp3` });
    expect(await env.DB.prepare("SELECT user_id AS userId, surface, characters, cached FROM speech_usage").first())
      .toEqual({ userId: s.learnerId, surface: "ai_practice", characters: "Goedemorgen allemaal".length, cached: 1 });
    await writeAiSettings(env.DB, { ...DEFAULT_AI_SETTINGS, dailySpeechCharCap: 30 });
    const limited = await call("POST", path, s.learner, undefined, speechEnv);
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe("SPEECH_DAILY_LIMIT");
  });
});
