import { env } from "cloudflare:test";
import { wordBatchesResponseSchema, wordDrillDeckSchema, type WordBatchStats } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn, word,
} from "./courseApi";
import { fetchWorker } from "./worker";

// Word batches (docs/words.md#word-batches): each batch's memory bands and Peek count, a Peek's exposures, and its "I know this word".
async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const course = await createCourse(groupId, owner);
  const path = coursePath(groupId, course.id);
  // Eighteen words in two sections make three batches of six.
  const words = Array.from({ length: 18 }, (_, index) => word(`woord ${String(index).padStart(2, "0")}`));
  const lesson = await addLesson(groupId, course.id, owner, "Batched", {
    document: documentOf(blocks.heading("Een"), blocks.vocabulary(...words.slice(0, 12)), blocks.heading("Twee"), blocks.vocabulary(...words.slice(12))),
  });
  const lessonPath = `${path}/lessons/${lesson.lesson.id}`;
  return { ownerId, readerId, groupId, owner, reader, course, path, words, lesson, lessonPath };
}
async function batches(lessonPath: string, cookie: string): Promise<WordBatchStats[]> {
  const response = await request(`${lessonPath}/word-batches`, cookie);
  expect(response.status, await response.clone().text()).toBe(200);
  return wordBatchesResponseSchema.parse(await response.json()).batches;
}
const exposures = (userId: string) => env.DB.prepare(
  "SELECT word_id AS wordId, seen_count AS seen, known_at IS NOT NULL AS known FROM word_exposures WHERE user_id = ? ORDER BY word_id",
).bind(userId).all<{ wordId: string; seen: number; known: number }>().then((rows) => rows.results);

beforeEach(resetDatabase);

describe("Word batches", () => {
  it("refuses anonymous requests, accounts that have not finished onboarding, and invalid input", async () => {
    const { groupId, lessonPath, words } = await setup();
    expect((await fetchWorker(`https://wordinator.test${lessonPath}/word-batches`)).status).toBe(401);
    const anonymous = await fetchWorker(`https://wordinator.test${lessonPath}/word-exposures`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wordIds: [words[0]!.id] }),
    });
    expect(anonymous.status).toBe(401);
    const newcomerId = await seedUser("newcomer"); await join(groupId, newcomerId);
    await env.DB.prepare("UPDATE users SET display_name = 'New learner' WHERE id = ?").bind(newcomerId).run();
    const newcomer = await signIn("newcomer");
    for (const response of [
      await request(`${lessonPath}/word-batches`, newcomer), await request(`${lessonPath}/word-exposures`, newcomer, { wordIds: [words[0]!.id] }),
      await request(`${lessonPath}/words/${words[0]!.id}/known`, newcomer, undefined, "PUT"),
    ]) {
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("ONBOARDING_REQUIRED");
    }
    expect(await exposures(newcomerId)).toEqual([]);
    const reader = await signIn("reader");
    for (const body of [{}, { wordIds: [] }, { wordIds: ["nope"] }, { wordIds: [words[0]!.id, words[0]!.id] }]) {
      const response = await request(`${lessonPath}/word-exposures`, reader, body);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("INVALID_WORDS");
    }
  });

  it("returns 404 for invisible lessons and words outside the lesson, and 409 for unpublished lessons", async () => {
    const { groupId, owner, reader, course, path, lessonPath } = await setup();
    const hidden = await createCourse(groupId, owner, false, { title: "Hidden", summary: "Not yet." });
    const secret = word("het geheim");
    const hiddenLesson = await addLesson(groupId, hidden.id, owner, "Secret", { document: documentOf(blocks.vocabulary(secret)) });
    const hiddenResponse = await request(`${coursePath(groupId, hidden.id)}/lessons/${hiddenLesson.lesson.id}/word-batches`, reader);
    expect(hiddenResponse.status).toBe(404);
    const missing = await request(`${lessonPath}/words/${secret.id}/known`, reader, undefined, "PUT");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("WORD_NOT_FOUND");
    const draft = await addLesson(groupId, course.id, owner, "Draft", { published: false, document: documentOf(blocks.vocabulary(word("het concept"))) });
    const unpublished = await request(`${path}/lessons/${draft.lesson.id}/word-batches`, owner);
    expect(unpublished.status).toBe(409);
    expect(await errorCode(unpublished)).toBe("LESSON_UNPUBLISHED");
  });

  it("counts each batch's words by memory band and Peek, privately per account", async () => {
    const { readerId, reader, owner, path, words, lesson, lessonPath } = await setup();
    const empty = { strong: 0, fading: 0, new: 6, total: 6, seen: 0 };
    expect(await batches(lessonPath, reader)).toEqual([empty, empty, empty]);
    // A Peek counts what it showed; a second Peek counts again. Exposure never writes memory.
    const first = words.slice(0, 6).map((entry) => entry.id);
    expect((await request(`${lessonPath}/word-exposures`, reader, { wordIds: first })).status).toBe(200);
    expect((await request(`${lessonPath}/word-exposures`, reader, { wordIds: first.slice(0, 2) })).status).toBe(200);
    expect((await exposures(readerId)).filter((row) => row.seen === 2)).toHaveLength(2);
    expect((await batches(lessonPath, reader))[0]).toEqual({ ...empty, seen: 6 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM word_memory WHERE user_id = ?").bind(readerId).first()).toEqual({ count: 0 });
    // Just reviewed, a word is Strong (recall now is near 1); a review long ago leaves it Fading.
    await request(`${path}/lessons/${lesson.lesson.id}/words/${words[6]!.id}/drill/understand`, reader, { result: "got" }, "PUT");
    await request(`${path}/lessons/${lesson.lesson.id}/words/${words[7]!.id}/drill/understand`, reader, { result: "got" }, "PUT");
    await env.DB.prepare("UPDATE word_memory SET last_reviewed_at = ? WHERE user_id = ? AND word_id = ?").bind(Date.now() - 365 * 86_400_000, readerId, words[7]!.id).run();
    expect((await batches(lessonPath, reader))[1]).toEqual({ strong: 1, fading: 1, new: 4, total: 6, seen: 0 });
    // "I know this word" in a Peek makes a word without memory Strong, and a fading one too.
    await request(`${lessonPath}/words/${words[8]!.id}/known`, reader, undefined, "PUT");
    await request(`${lessonPath}/words/${words[7]!.id}/known`, reader, undefined, "PUT");
    expect((await batches(lessonPath, reader))[1]).toEqual({ strong: 3, fading: 0, new: 3, total: 6, seen: 0 });
    // Nobody else sees them.
    expect(await batches(lessonPath, owner)).toEqual([empty, empty, empty]);
  });

  it("puts a word known in a Peek last in a drill, until an Again or clearing it", async () => {
    const { groupId, readerId, reader, path, words, lesson, lessonPath } = await setup();
    const known = words[0]!;
    await request(`${lessonPath}/words/${known.id}/known`, reader, undefined, "PUT");
    const drill = async () => {
      const response = await request(`/api/groups/${groupId}/word-drill?source=lesson&lessonId=${lesson.lesson.id}&direction=understand`, reader);
      return wordDrillDeckSchema.parse(await response.json()).cards.map((card) => card.word.id);
    };
    // Eighteen words, ten cards: a word known comes last, so it is never drawn.
    for (let attempt = 0; attempt < 3; attempt += 1) expect(await drill()).not.toContain(known.id);
    await request(`${path}/lessons/${lesson.lesson.id}/words/${known.id}/drill/produce`, reader, { result: "again" }, "PUT");
    expect((await exposures(readerId)).find((row) => row.wordId === known.id)?.known).toBe(0);
    await request(`${lessonPath}/words/${known.id}/known`, reader, undefined, "PUT");
    expect((await exposures(readerId)).find((row) => row.wordId === known.id)?.known).toBe(1);
    expect((await request(`${lessonPath}/words/${known.id}/known`, reader, undefined, "DELETE")).status).toBe(200);
    expect((await exposures(readerId)).find((row) => row.wordId === known.id)?.known).toBe(0);
    expect(await env.DB.prepare("SELECT MAX(known_override) AS known FROM word_memory WHERE user_id = ?").bind(readerId).first()).toEqual({ known: 0 });
  });

  it("forgets a lesson's exposures when the lesson is reset", async () => {
    const { readerId, reader, path, words, lesson, lessonPath } = await setup();
    await request(`${lessonPath}/word-exposures`, reader, { wordIds: [words[0]!.id] });
    await request(`${lessonPath}/words/${words[1]!.id}/known`, reader, undefined, "PUT");
    expect(await exposures(readerId)).toHaveLength(2);
    expect((await request(`${path}/lessons/${lesson.lesson.id}/reset`, reader, {})).status).toBe(200);
    expect(await exposures(readerId)).toEqual([]);
  });

  it("deletes every account's exposures with the lesson", async () => {
    const { readerId, reader, owner, path, words, lesson, lessonPath } = await setup();
    await request(`${lessonPath}/word-exposures`, reader, { wordIds: [words[0]!.id] });
    expect((await request(`${path}/lessons/${lesson.lesson.id}`, owner, undefined, "DELETE")).status).toBe(200);
    expect(await exposures(readerId)).toEqual([]);
  });
});
