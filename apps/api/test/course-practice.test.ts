import { env } from "cloudflare:test";
import { practiceCheckResponseSchema, practiceProgressResponseSchema } from "@wordinator/contracts";
import { courseDetailResponseSchema, readPracticeBlock, type LessonBlockOf } from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import { addLesson, blocks, coursePath, createCourse, documentOf, join, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup, seedUser, signIn } from "./courseApi";

const fillPractice = {
  instruction: "Complete each sentence with 'er is' or 'er zijn'.",
  items: [
    { prompt: "… een kleine keuken.", authorsVersion: ["Er is"], note: "One kitchen, so singular." },
    { prompt: "… drie slaapkamers.", authorsVersion: ["Er zijn"] },
  ],
};

type Setup = { groupId: string; courseId: string; lessonId: string; block: { id: string }; owner: string; lessonPath: string; path: string };

async function publishedPractice(ownerLabel: string, groupId: string, payload: unknown = fillPractice): Promise<Setup> {
  const owner = await signIn(ownerLabel);
  const course = await createCourse(groupId, owner, true, fixture.course);
  const block = blocks.practice(payload);
  const { lesson, path } = await addLesson(groupId, course.id, owner, "Mijn huis", { document: documentOf(block) });
  return { groupId, courseId: course.id, lessonId: lesson.id, block, owner, lessonPath: path, path: `${path}/blocks/${block.id}` };
}

// Replaces the lesson's draft and publishes it, as the owner does from the editor.
async function republish(setup: Setup, ...items: unknown[]) {
  const current = await readLesson(setup.lessonPath, setup.owner);
  const saved = await saveDraft(setup.lessonPath, setup.owner, documentOf(...items), current.draft!.version);
  return publishLesson(setup.lessonPath, setup.owner, saved.draftVersion);
}

const saveProgress = async (setup: Setup, cookie: string, answered: number) => {
  const response = await request(`${setup.path}/progress`, cookie, { answered }, "PUT");
  expect(response.status).toBe(200);
  return practiceProgressResponseSchema.parse(await response.json()).progress;
};
const progressRows = async () => (await env.DB.prepare("SELECT COUNT(*) AS total FROM course_practice_progress").first<{ total: number }>())!.total;

beforeEach(resetDatabase);

describe("Course practices and practice progress API", () => {
  it("stores every fixture practice and never sends authors' versions or notes to learners", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const reading = fixture.lessons.flatMap((lesson) => lesson.blocks).find((block) => block.kind === "practice" && "passage" in block.payload)!;
    const setup = await publishedPractice("owner", groupId, reading.payload);
    const reader = await signIn("reader");

    // The editor receives the full practice in the draft; the reader gets prompts only.
    const asEditor = await readLesson(setup.lessonPath, setup.owner);
    expect(asEditor.practiceProgress).toEqual({ [setup.block.id]: { done: 0, started: 0, answered: null } });
    expect(readPracticeBlock(asEditor.draft!.document.blocks[0] as LessonBlockOf<"practice">).items[0]!.authorsVersion).toEqual(["Op de tweede verdieping."]);
    const readerDetail = await (await request(coursePath(groupId, setup.courseId), reader)).text();
    const readerLesson = await (await request(`${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}`, reader)).text();
    for (const raw of [readerDetail, readerLesson]) {
      expect(raw).toContain("Op welke verdieping is het appartement?");
      expect(raw).not.toContain("Op de tweede verdieping.");
      expect(raw).not.toContain("authorsVersion");
    }
    const lesson = courseDetailResponseSchema.parse(JSON.parse(readerDetail)).lessons[0]!;
    expect(lesson.draft).toBeNull();
    expect(readPracticeBlock(lesson.document!.blocks[0] as LessonBlockOf<"practice">).passage).toMatchObject({ title: "Licht appartement met balkon" });

    // No endpoint hands the author's version out wholesale; the retired thread endpoints are gone.
    expect((await request(`${setup.path}/discussion`, reader)).status).toBe(404);
    expect((await request(`${setup.path}/comments`, reader, { kind: "practice_response", answers: ["a", "b"] })).status).toBe(404);
  });

  it("records how many questions each person answered, keeps the highest count, and counts who is done", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");

    expect(await saveProgress(setup, reader, 1)).toEqual({ done: 0, started: 1, answered: 1 });
    // A device with an empty draft never lowers the count.
    expect(await saveProgress(setup, reader, 0)).toEqual({ done: 0, started: 1, answered: 1 });
    expect(await saveProgress(setup, reader, 2)).toEqual({ done: 1, started: 1, answered: 2 });
    expect(await saveProgress(setup, setup.owner, 0)).toEqual({ done: 1, started: 2, answered: 0 });
    expect((await readLesson(setup.lessonPath, reader)).practiceProgress).toEqual({ [setup.block.id]: { done: 1, started: 2, answered: 2 } });
    expect((await readLesson(setup.lessonPath, setup.owner)).practiceProgress).toEqual({ [setup.block.id]: { done: 1, started: 2, answered: 0 } });
    // Only the count is stored, never an answer, and nothing creates notifications.
    expect(await env.DB.prepare("SELECT practice_id AS practiceId, answered FROM course_practice_progress WHERE user_id = ?").bind(readerId).first()).toEqual({ practiceId: setup.block.id, answered: 2 });
    expect((await env.DB.prepare("SELECT COUNT(*) AS total FROM notifications").first<{ total: number }>())!.total).toBe(0);

    // Adding questions moves people back from done; their count stays.
    const changed = { instruction: "Nieuw", items: [{ prompt: "… een tuin." }, { prompt: "… twee balkons." }, { prompt: "… een lift?" }] };
    await republish(setup, blocks.practice(changed, setup.block.id));
    expect((await readLesson(setup.lessonPath, reader)).practiceProgress).toEqual({ [setup.block.id]: { done: 0, started: 2, answered: 2 } });
    expect(await saveProgress(setup, reader, 3)).toEqual({ done: 1, started: 2, answered: 3 });
  });

  it("rejects invalid counts, draft-only practices, archived courses, and anonymous requests", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");

    expect((await request(`${setup.path}/progress`, "", { answered: 1 }, "PUT")).status).toBe(401);
    for (const body of [{ answered: 3 }, { answered: -1 }, { answered: 1.5 }, {}]) expect((await request(`${setup.path}/progress`, reader, body, "PUT")).status).toBe(400);
    expect(await progressRows()).toBe(0);

    // An editor may preview a draft-only practice, but the preview records nothing; readers cannot see it at all.
    const hidden = blocks.practice(fillPractice);
    const current = await readLesson(setup.lessonPath, setup.owner);
    await saveDraft(setup.lessonPath, setup.owner, documentOf(...current.draft!.document.blocks, hidden), current.draft!.version);
    const hiddenPath = `${setup.lessonPath}/blocks/${hidden.id}/progress`;
    expect((await request(hiddenPath, setup.owner, { answered: 1 }, "PUT")).status).toBe(409);
    expect((await request(hiddenPath, reader, { answered: 1 }, "PUT")).status).toBe(404);

    await request(`${coursePath(groupId, setup.courseId)}/archive`, setup.owner, {});
    expect((await request(`${setup.path}/progress`, setup.owner, { answered: 1 }, "PUT")).status).toBe(409);
    expect((await request(`${setup.path}/progress`, reader, { answered: 1 }, "PUT")).status).toBe(404);
    expect(await progressRows()).toBe(0);
  });

  it("cascades practice removal and lesson deletion to progress rows", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");
    await saveProgress(setup, reader, 2);
    // Removing the practice from the draft keeps progress until publishing drops it from both documents.
    const current = await readLesson(setup.lessonPath, setup.owner);
    await saveDraft(setup.lessonPath, setup.owner, documentOf(blocks.paragraph("No more practice")), current.draft!.version);
    expect(await progressRows()).toBe(1);
    await republish(setup, blocks.paragraph("No more practice"));
    expect(await progressRows()).toBe(0);

    const second = await publishedPractice("owner", groupId);
    await saveProgress(second, reader, 1);
    expect((await request(`${coursePath(groupId, second.courseId)}/lessons/${second.lessonId}`, second.owner, undefined, "DELETE")).status).toBe(200);
    expect(await progressRows()).toBe(0);
  });

  it("isolates practice progress by tenant, nesting, visibility, and target", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const outsiderId = await seedUser("outsider");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const otherGroupId = await seedGroup("beta", outsiderId);
    const setup = await publishedPractice("owner", groupId);
    const other = await publishedPractice("outsider", otherGroupId);
    const reader = await signIn("reader"); const outsider = await signIn("outsider");
    const body = { answered: 1 };

    // A non-member cannot reach the practice, and a member of another group cannot use its own group ID as a key.
    expect((await request(`${setup.path}/progress`, outsider, body, "PUT")).status).toBe(404);
    const crossed = `/api/groups/${otherGroupId}/courses/${setup.courseId}/lessons/${setup.lessonId}/blocks/${setup.block.id}`;
    expect((await request(`${crossed}/progress`, outsider, body, "PUT")).status).toBe(404);
    // Another group's block, lesson, or course ID nested under a valid path is not found.
    const base = `${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}/blocks`;
    expect((await request(`${base}/${other.block.id}/progress`, setup.owner, body, "PUT")).status).toBe(404);
    expect((await request(`${coursePath(groupId, setup.courseId)}/lessons/${other.lessonId}/blocks/${setup.block.id}/progress`, setup.owner, body, "PUT")).status).toBe(404);
    expect((await request(`${coursePath(groupId, other.courseId)}/lessons/${setup.lessonId}/blocks/${setup.block.id}/progress`, setup.owner, body, "PUT")).status).toBe(404);
    // A non-practice block has no progress.
    const paragraph = blocks.paragraph("Hallo");
    await republish(setup, blocks.practice(fillPractice, setup.block.id), paragraph);
    expect((await request(`${base}/${paragraph.id}/progress`, reader, body, "PUT")).status).toBe(404);
    expect(await progressRows()).toBe(0);
  });

  it("confirms matches and answers misses with the author's version, storing nothing", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId, {
      instruction: "Vertaal of vul in.",
      items: [...fillPractice.items, { prompt: "There is a garden." }, { prompt: "There is a balcony.", authorsVersion: ["Er is een balkon."] }],
    });
    const reader = await signIn("reader");
    const result = async (item: number, answer: string) => {
      const response = await request(`${setup.path}/check`, reader, { item, answer });
      expect(response.status).toBe(200);
      return practiceCheckResponseSchema.parse(await response.json());
    };
    const check = async (item: number, answer: string) => (await result(item, answer)).match;
    // A match needs no reference; a miss returns the author's version, but never the item note.
    expect(await result(0, "Er is")).toEqual({ match: true, authorsVersion: null });
    expect(await result(1, "Er is")).toEqual({ match: false, authorsVersion: ["Er zijn"] });
    expect(await result(2, "Er is een tuin.")).toEqual({ match: false, authorsVersion: null });
    expect(JSON.stringify(await result(0, "Daar is"))).not.toContain("One kitchen");
    expect(await check(0, " er IS ")).toBe(true);
    expect(await check(0, "Er is een kleine keuken")).toBe(true);
    expect(await check(1, "Er is")).toBe(false);
    expect(await check(3, "er is een balkon")).toBe(true);
    expect(await check(3, "Een balkon is er.")).toBe(false);
    // Items without an author's version and blank answers never match.
    expect(await check(2, "Er is een tuin.")).toBe(false);
    expect(await check(3, "  ")).toBe(false);
    expect((await request(`${setup.path}/check`, reader, { item: 4, answer: "x" })).status).toBe(404);
    expect((await request(`${setup.path}/check`, reader, { item: -1, answer: "x" })).status).toBe(400);
    expect(await progressRows()).toBe(0);
  });

  it("isolates answer checks by tenant and visibility", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const outsiderId = await seedUser("outsider");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const otherGroupId = await seedGroup("beta", outsiderId);
    const setup = await publishedPractice("owner", groupId);
    const other = await publishedPractice("outsider", otherGroupId);
    const reader = await signIn("reader"); const outsider = await signIn("outsider");
    const body = { item: 0, answer: "Er is" };
    expect((await request(`${setup.path}/check`, outsider, body)).status).toBe(404);
    const crossed = `/api/groups/${otherGroupId}/courses/${setup.courseId}/lessons/${setup.lessonId}/blocks/${setup.block.id}`;
    expect((await request(`${crossed}/check`, outsider, body)).status).toBe(404);
    const base = `${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}/blocks`;
    expect((await request(`${base}/${other.block.id}/check`, reader, body)).status).toBe(404);
    // A practice that exists only in the draft cannot be checked by readers.
    const hidden = blocks.practice(fillPractice);
    const current = await readLesson(setup.lessonPath, setup.owner);
    await saveDraft(setup.lessonPath, setup.owner, documentOf(...current.draft!.document.blocks, hidden), current.draft!.version);
    expect((await request(`${base}/${hidden.id}/check`, reader, body)).status).toBe(404);
    expect((await request(`${base}/${hidden.id}/check`, setup.owner, body)).status).toBe(200);
  });
});
