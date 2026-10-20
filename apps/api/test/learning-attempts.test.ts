import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { insertPracticeAttempt, lessonPracticeCheck } from "../src/learning/attempts";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn, word,
} from "./courseApi";
import { fetchWorker } from "./worker";

// Practice and pronunciation attempts (C14b; docs/courses.md#practice-attempts, docs/words.md#pronunciation-assessment).
const practice = {
  instruction: "Vertaal en vul in.",
  items: [
    { prompt: "I am tired.", authorsVersion: ["Ik ben moe."] },
    { prompt: "… een kleine keuken en … slaapkamers.", authorsVersion: ["Er is", "twee"] },
    { prompt: "Describe your house." },
  ],
};

type AttemptRow = {
  userId: string; courseId: string; lessonId: string | null; practiceKind: string; practiceId: string; itemIndex: number; prompt: string; answer: string;
  reference: string | null; matched: number | null; aiVerdict: string | null; source: string; conversationId: string | null;
};
const attempts = () => env.DB.prepare(
  `SELECT user_id AS userId, course_id AS courseId, lesson_id AS lessonId, practice_kind AS practiceKind, practice_id AS practiceId, item_index AS itemIndex,
     prompt, answer, reference, matched, ai_verdict AS aiVerdict, source, conversation_id AS conversationId
   FROM practice_attempts ORDER BY created_at, rowid`,
).all<AttemptRow>().then((rows) => rows.results);
const pronunciations = () => env.DB.prepare(
  `SELECT user_id AS userId, surface, reference_text AS referenceText, term_key AS termKey, lesson_id AS lessonId, word_id AS wordId, overall, accuracy,
     fluency, completeness, word_scores AS wordScores FROM pronunciation_attempts ORDER BY created_at, rowid`,
).all<{ userId: string; surface: string; referenceText: string; termKey: string | null; lessonId: string | null; wordId: string | null; overall: number; accuracy: number; fluency: number; completeness: number; wordScores: string }>()
  .then((rows) => rows.results);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const outsiderId = await seedUser("outsider");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const otherGroupId = await seedGroup("beta", outsiderId);
  const owner = await signIn("owner"); const reader = await signIn("reader"); const outsider = await signIn("outsider");
  const course = await createCourse(groupId, owner);
  const block = blocks.practice(practice);
  const hond = word("de hond");
  const { lesson, path: lessonPath } = await addLesson(groupId, course.id, owner, "Mijn huis", { document: documentOf(block, blocks.vocabulary(hond)) });
  const attemptPath = `${lessonPath}/blocks/${block.id}/attempts`;
  return { ownerId, readerId, outsiderId, groupId, otherGroupId, owner, reader, outsider, course, block, hond, lesson, lessonPath, attemptPath };
}

beforeEach(resetDatabase);

describe("Practice attempts API", () => {
  it("records a checked answer with the match decided on the server", async () => {
    const { readerId, reader, course, lesson, block, attemptPath } = await setup();
    // A matching open answer, a miss the client claims matched, blanks joined by ` · `, and an item with nothing to check.
    for (const body of [
      { item: 0, answer: "ik ben MOE" }, { item: 0, answer: "Ik ben blij.", matched: true }, { item: 1, answer: "Er is · twee" }, { item: 2, answer: "Groot." },
    ]) {
      const response = await request(attemptPath, reader, body);
      expect(response.status, await response.clone().text()).toBe(204);
      expect(await response.text()).toBe("");
    }
    const base = { userId: readerId, courseId: course.id, lessonId: lesson.id, practiceKind: "lesson", practiceId: block.id, source: "lesson", aiVerdict: null, conversationId: null };
    expect(await attempts()).toEqual([
      { ...base, itemIndex: 0, prompt: "I am tired.", answer: "ik ben MOE", reference: "Ik ben moe.", matched: 1 },
      { ...base, itemIndex: 0, prompt: "I am tired.", answer: "Ik ben blij.", reference: "Ik ben moe.", matched: 0 },
      { ...base, itemIndex: 1, prompt: "… een kleine keuken en … slaapkamers.", answer: "Er is · twee", reference: "Er is · twee", matched: 1 },
      { ...base, itemIndex: 2, prompt: "Describe your house.", answer: "Groot.", reference: null, matched: null },
    ]);
  });

  it("reads the published author's version, not the draft", async () => {
    const { reader, owner, lessonPath, block, attemptPath } = await setup();
    const current = await readLesson(lessonPath, owner);
    const drafted = { ...practice, items: [{ prompt: "I am tired.", authorsVersion: ["Ik ben heel moe."] }, ...practice.items.slice(1)] };
    await saveDraft(lessonPath, owner, documentOf(blocks.practice(drafted, block.id)), current.draft!.version);
    expect((await request(attemptPath, reader, { item: 0, answer: "Ik ben heel moe." })).status).toBe(204);
    expect((await attempts()).map((row) => [row.reference, row.matched])).toEqual([["Ik ben moe.", 0]]);
  });

  it("refuses anonymous requests, unfinished setup, and invalid bodies", async () => {
    const { groupId, reader, attemptPath } = await setup();
    const anonymous = await fetchWorker(`https://wordinator.test${attemptPath}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item: 0, answer: "x" }) });
    expect(anonymous.status).toBe(401);
    const newcomerId = await seedUser("newcomer"); await join(groupId, newcomerId);
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await request(attemptPath, await signIn("newcomer"), { item: 0, answer: "x" });
    expect(newcomer.status).toBe(403);
    expect(await errorCode(newcomer)).toBe("ONBOARDING_REQUIRED");
    for (const body of [{ item: 0, answer: "" }, { item: 0, answer: "   " }, { item: 0, answer: "a".repeat(2_001) }, { item: -1, answer: "x" }, { item: "0", answer: "x" }, { answer: "x" }, {}]) {
      const response = await request(attemptPath, reader, body);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    }
    const item = await request(attemptPath, reader, { item: 3, answer: "x" });
    expect(item.status).toBe(404);
    expect(await errorCode(item)).toBe("PRACTICE_ITEM_NOT_FOUND");
    expect(await attempts()).toEqual([]);
  });

  it("resolves the practice only under its own group, course, lesson, and block", async () => {
    const { groupId, otherGroupId, owner, reader, outsider, course, lesson, lessonPath, block } = await setup();
    const other = await addLesson(groupId, course.id, owner, "Other", { document: documentOf(blocks.paragraph("No practice")) });
    const otherCourse = await createCourse(groupId, owner);
    const missing = crypto.randomUUID();
    for (const [path, cookie, code] of [
      [`${lessonPath}/blocks/${missing}/attempts`, reader, "PRACTICE_NOT_FOUND"],
      [`${other.path}/blocks/${block.id}/attempts`, reader, "PRACTICE_NOT_FOUND"],
      [`${coursePath(groupId, otherCourse.id)}/lessons/${lesson.id}/blocks/${block.id}/attempts`, reader, "LESSON_NOT_FOUND"],
      [`${coursePath(groupId, missing)}/lessons/${lesson.id}/blocks/${block.id}/attempts`, reader, "COURSE_NOT_FOUND"],
      [`${coursePath(otherGroupId, course.id)}/lessons/${lesson.id}/blocks/${block.id}/attempts`, outsider, "COURSE_NOT_FOUND"],
      [`${lessonPath}/blocks/${block.id}/attempts`, outsider, "GROUP_NOT_FOUND"],
    ] as const) {
      const response = await request(path, cookie, { item: 0, answer: "Ik ben moe." });
      expect(response.status, path).toBe(404);
      expect(await errorCode(response)).toBe(code);
    }
    expect(await attempts()).toEqual([]);
  });

  it("records nothing for unpublished lessons, draft-only practices, or archived courses", async () => {
    const { groupId, owner, reader, course, lessonPath, attemptPath } = await setup();
    // A practice only in the draft: editors are told it is not published, readers cannot see it.
    const hidden = blocks.practice(practice);
    const current = await readLesson(lessonPath, owner);
    await saveDraft(lessonPath, owner, documentOf(...current.draft!.document.blocks, hidden), current.draft!.version);
    const hiddenPath = `${lessonPath}/blocks/${hidden.id}/attempts`;
    const preview = await request(hiddenPath, owner, { item: 0, answer: "x" });
    expect(preview.status).toBe(409);
    expect(await errorCode(preview)).toBe("PRACTICE_NOT_PUBLISHED");
    expect((await request(hiddenPath, reader, { item: 0, answer: "x" })).status).toBe(404);

    // A draft lesson is invisible to readers, and an editor's preview of it records nothing.
    const draft = blocks.practice(practice);
    const unpublished = await addLesson(groupId, course.id, owner, "Draft", { document: documentOf(draft), published: false });
    expect((await request(`${unpublished.path}/blocks/${draft.id}/attempts`, reader, { item: 0, answer: "x" })).status).toBe(404);
    expect((await request(`${unpublished.path}/blocks/${draft.id}/attempts`, owner, { item: 0, answer: "x" })).status).toBe(409);
    // Unpublishing takes the published document away.
    expect((await request(`${lessonPath}/unpublish`, owner, {})).status).toBe(200);
    expect((await request(attemptPath, reader, { item: 0, answer: "x" })).status).toBe(404);
    expect((await request(attemptPath, owner, { item: 0, answer: "x" })).status).toBe(409);
    expect(await attempts()).toEqual([]);
  });

  it("refuses archived courses", async () => {
    const { groupId, owner, reader, course, attemptPath } = await setup();
    expect((await request(`${coursePath(groupId, course.id)}/archive`, owner, {})).status).toBe(200);
    const archived = await request(attemptPath, owner, { item: 0, answer: "Ik ben moe." });
    expect(archived.status).toBe(409);
    expect(await errorCode(archived)).toBe("COURSE_ARCHIVED");
    expect((await request(attemptPath, reader, { item: 0, answer: "Ik ben moe." })).status).toBe(404);
    expect(await attempts()).toEqual([]);
  });

  it("exports helpers that the tutor phases reuse", async () => {
    const { readerId, course, lesson, block } = await setup();
    expect(lessonPracticeCheck({ prompt: "… huis.", authorsVersion: ["Mijn"], note: null }, "mijn huis")).toEqual({ prompt: "… huis.", reference: "Mijn", matched: true });
    expect(lessonPracticeCheck({ prompt: "… en ….", authorsVersion: ["a", null], note: null }, "a · b")).toEqual({ prompt: "… en ….", reference: null, matched: null });
    const conversationId = crypto.randomUUID();
    await insertPracticeAttempt(env.DB, {
      userId: readerId, courseId: course.id, lessonId: lesson.id, practiceKind: "lesson", practiceId: block.id, itemIndex: 2, prompt: "Describe your house.",
      answer: "Groot.", reference: null, matched: null, aiVerdict: "acceptable", aiNote: "Fine.", source: "ai_chat", conversationId,
    });
    expect(await attempts()).toMatchObject([{ source: "ai_chat", aiVerdict: "acceptable", conversationId, matched: null }]);
  });
});

describe("Pronunciation attempts API", () => {
  const scores = {
    referenceText: "de hond", overall: 82, accuracy: 90, fluency: 74.5, completeness: 100,
    words: [{ word: "de", accuracy: 95, error: "none" }, { word: "hond", accuracy: 55, error: "mispronunciation" }],
  };

  it("stores an assessment with the term key from the published index", async () => {
    const { groupId, readerId, reader, lesson, hond } = await setup();
    const path = `/api/groups/${groupId}/pronunciation-attempts`;
    const response = await request(path, reader, { ...scores, surface: "word_card", lessonId: lesson.id, wordId: hond.id, termKey: "something else" });
    expect(response.status, await response.clone().text()).toBe(204);
    expect((await request(path, reader, { ...scores, surface: "ai_chat", termKey: "de hond" })).status).toBe(204);
    expect((await request(path, reader, { ...scores, surface: "drill" })).status).toBe(204);
    const rows = await pronunciations();
    expect(rows.map(({ wordScores: _scores, ...row }) => row)).toEqual([
      { userId: readerId, surface: "word_card", referenceText: "de hond", termKey: "de hond", lessonId: lesson.id, wordId: hond.id, overall: 82, accuracy: 90, fluency: 74.5, completeness: 100 },
      { userId: readerId, surface: "ai_chat", referenceText: "de hond", termKey: "de hond", lessonId: null, wordId: null, overall: 82, accuracy: 90, fluency: 74.5, completeness: 100 },
      { userId: readerId, surface: "drill", referenceText: "de hond", termKey: null, lessonId: null, wordId: null, overall: 82, accuracy: 90, fluency: 74.5, completeness: 100 },
    ]);
    expect(JSON.parse(rows[0]!.wordScores)).toEqual(scores.words);
  });

  it("refuses anonymous requests, unfinished setup, and invalid bodies", async () => {
    const { groupId, reader, lesson, hond } = await setup();
    const path = `/api/groups/${groupId}/pronunciation-attempts`;
    const anonymous = await fetchWorker(`https://wordinator.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...scores, surface: "drill" }) });
    expect(anonymous.status).toBe(401);
    const newcomerId = await seedUser("newcomer"); await join(groupId, newcomerId);
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await request(path, await signIn("newcomer"), { ...scores, surface: "drill" });
    expect(newcomer.status).toBe(403);
    expect(await errorCode(newcomer)).toBe("ONBOARDING_REQUIRED");
    for (const body of [
      { ...scores }, { ...scores, surface: "lesson" }, { ...scores, surface: "drill", overall: 101 }, { ...scores, surface: "drill", referenceText: "a".repeat(201) },
      { ...scores, surface: "drill", words: Array.from({ length: 51 }, () => scores.words[0]) }, { ...scores, surface: "drill", lessonId: lesson.id },
      { ...scores, surface: "drill", wordId: hond.id },
    ]) {
      const response = await request(path, reader, body);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("VALIDATION_ERROR");
    }
    expect(await pronunciations()).toEqual([]);
  });

  it("refuses words outside a published index the learner can read", async () => {
    const { groupId, otherGroupId, owner, reader, outsider, course, lesson, hond } = await setup();
    const path = `/api/groups/${groupId}/pronunciation-attempts`;
    const draftWord = word("de kat");
    const draft = await addLesson(groupId, course.id, owner, "Draft", { document: documentOf(blocks.vocabulary(draftWord)), published: false });
    const draftCourse = await createCourse(groupId, owner, false);
    const hidden = word("het huis");
    const hiddenLesson = await addLesson(groupId, draftCourse.id, owner, "Hidden", { document: documentOf(blocks.vocabulary(hidden)) });
    for (const [cookie, lessonId, wordId] of [
      [reader, lesson.id, crypto.randomUUID()], [reader, crypto.randomUUID(), hond.id], [reader, draft.lesson.id, draftWord.id],
      [owner, draft.lesson.id, draftWord.id], [reader, hiddenLesson.lesson.id, hidden.id],
    ] as const) {
      const response = await request(path, cookie, { ...scores, surface: "word_card", lessonId, wordId });
      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("WORD_NOT_FOUND");
    }
    // Another group's member cannot reach this group, nor name its lesson from their own.
    expect((await request(path, outsider, { ...scores, surface: "word_card", lessonId: lesson.id, wordId: hond.id })).status).toBe(404);
    const elsewhere = await request(`/api/groups/${otherGroupId}/pronunciation-attempts`, outsider, { ...scores, surface: "word_card", lessonId: lesson.id, wordId: hond.id });
    expect(await errorCode(elsewhere)).toBe("WORD_NOT_FOUND");
    expect(await pronunciations()).toEqual([]);
  });
});
