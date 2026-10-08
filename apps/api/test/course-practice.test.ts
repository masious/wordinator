import { env } from "cloudflare:test";
import { commentResponseSchema, practiceCheckResponseSchema, practiceDiscussionResponseSchema, reactionTargetResponseSchema } from "@wordinator/contracts";
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

const answer = async (setup: Setup, cookie: string, answers: string[]) => {
  const response = await request(`${setup.path}/comments`, cookie, { kind: "practice_response", answers });
  expect(response.status).toBe(201);
  return commentResponseSchema.parse(await response.json()).item;
};
const thread = async (setup: Setup, cookie: string) => practiceDiscussionResponseSchema.parse(await (await request(`${setup.path}/discussion`, cookie)).json());

beforeEach(resetDatabase);

describe("Course practices and answer threads API", () => {
  it("stores every fixture practice and never sends authors' versions or notes to learners", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const reading = fixture.lessons.flatMap((lesson) => lesson.blocks).find((block) => block.kind === "practice" && "passage" in block.payload)!;
    const setup = await publishedPractice("owner", groupId, reading.payload);
    const reader = await signIn("reader");

    // The editor receives the full practice in the draft; the reader gets prompts only.
    const asEditor = await readLesson(setup.lessonPath, setup.owner);
    expect(asEditor.answerCounts).toEqual({ [setup.block.id]: 0 });
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

    // The reference arrives only with the thread, which the client fetches when the reader reveals it.
    const revealed = await thread(setup, reader);
    expect(revealed.reference.items[0]).toMatchObject({ prompt: "Op welke verdieping is het appartement?", authorsVersion: ["Op de tweede verdieping."] });
    expect(revealed.items).toEqual([]);
  });

  it("publishes ordered answer sets with blanks, replies, reactions, and no matching or pins", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");

    const item = await answer(setup, reader, ["Er is", "  "]);
    expect(item).toMatchObject({ kind: "practice_response", pinned: false, permissions: { pin: false, reply: true, edit: true } });
    expect(item.responseItems).toEqual([
      { position: 0, prompt: "… een kleine keuken.", answer: "Er is", skipped: false, matched: null },
      { position: 1, prompt: "… drie slaapkamers.", answer: "", skipped: true, matched: null },
    ]);
    expect((await request(`${setup.path}/comments`, reader, { kind: "practice_response", answers: ["Er is"] })).status).toBe(400);
    expect((await request(`${setup.path}/comments`, reader, { kind: "text", body: "Top-level text" })).status).toBe(400);
    expect((await request(`${setup.path}/comments`, reader, { kind: "fill_response", answers: ["Er is", "Er zijn"] })).status).toBe(400);

    const reply = await request(`${setup.path}/comments`, setup.owner, { kind: "text", body: "Goed gedaan!", parentId: item.id });
    expect(reply.status).toBe(201);
    const replyItem = commentResponseSchema.parse(await reply.json()).item;
    expect((await request(`${setup.path}/comments`, reader, { kind: "text", body: "Nested", parentId: replyItem.id })).status).toBe(400);

    const reacted = await request(`${setup.path}/comments/${item.id}/reactions`, setup.owner, { emoji: "👍", active: true }, "PUT");
    expect(reactionTargetResponseSchema.parse(await reacted.json()).reactions).toMatchObject([{ emoji: "👍", count: 1 }]);
    // Practice-thread activity creates no notifications.
    expect((await env.DB.prepare("SELECT COUNT(*) AS total FROM notifications").first<{ total: number }>())!.total).toBe(0);

    const read = await thread(setup, reader);
    expect(read.count).toBe(2);
    expect(read.items[0]!.replies.map((entry) => entry.body)).toEqual(["Goed gedaan!"]);
    expect(read.items[0]!.reactions[0]!.count).toBe(1);
    expect((await readLesson(setup.lessonPath, reader)).answerCounts).toEqual({ [setup.block.id]: 2 });
  });

  it("keeps prompt snapshots when the practice changes and edits against them", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");
    const item = await answer(setup, reader, ["Er is", "Er zijn"]);

    const changed = { instruction: "Nieuw", items: [{ prompt: "… een tuin." }, { prompt: "… twee balkons." }, { prompt: "… een lift?" }] };
    await republish(setup, blocks.practice(changed, setup.block.id));
    expect((await thread(setup, reader)).items[0]!.responseItems.map((entry) => entry.prompt)).toEqual(["… een kleine keuken.", "… drie slaapkamers."]);

    const edited = await request(`${setup.path}/comments/${item.id}`, reader, { kind: "practice_response", answers: ["Er is", "Er zijn er"] }, "PATCH");
    expect(edited.status).toBe(200);
    const saved = commentResponseSchema.parse(await edited.json()).item;
    expect(saved).toMatchObject({ edited: true });
    expect(saved.responseItems.map((entry) => [entry.prompt, entry.answer])).toEqual([["… een kleine keuken.", "Er is"], ["… drie slaapkamers.", "Er zijn er"]]);
    expect((await request(`${setup.path}/comments/${item.id}`, reader, { kind: "practice_response", answers: ["a", "b", "c"] }, "PATCH")).status).toBe(400);
    expect((await request(`${setup.path}/comments/${item.id}`, setup.owner, { kind: "practice_response", answers: ["a", "b"] }, "PATCH")).status).toBe(403);
    // A new answer set follows the current practice.
    expect((await answer(setup, setup.owner, ["Er is", "", ""])).responseItems.map((entry) => entry.prompt)).toEqual(changed.items.map((entry) => entry.prompt));
  });

  it("cascades practice removal and lesson deletion to answers, replies, response items, and reactions", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const setup = await publishedPractice("owner", groupId); const reader = await signIn("reader");
    const counts = async () => env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM comment_response_items) AS items, (SELECT COUNT(*) FROM reactions) AS reactions",
    ).first<{ comments: number; items: number; reactions: number }>();
    const seedThread = async (target: Setup) => {
      const item = await answer(target, reader, ["Er is", "Er zijn"]);
      const reply = commentResponseSchema.parse(await (await request(`${target.path}/comments`, target.owner, { kind: "text", body: "Ja", parentId: item.id })).json()).item;
      await request(`${target.path}/comments/${item.id}/reactions`, target.owner, { emoji: "👍", active: true }, "PUT");
      await request(`${target.path}/comments/${reply.id}/reactions`, reader, { emoji: "❤️", active: true }, "PUT");
    };
    await seedThread(setup);
    expect(await counts()).toEqual({ comments: 2, items: 2, reactions: 2 });
    // Removing the practice from the draft keeps the thread until publishing drops it from both documents.
    await republish(setup, blocks.paragraph("No more practice"));
    expect(await counts()).toEqual({ comments: 0, items: 0, reactions: 0 });

    const second = await publishedPractice("owner", groupId);
    await seedThread(second);
    expect((await request(`${coursePath(groupId, second.courseId)}/lessons/${second.lessonId}`, second.owner, undefined, "DELETE")).status).toBe(200);
    expect(await counts()).toEqual({ comments: 0, items: 0, reactions: 0 });
  });

  it("limits deletion to the author and group creator and freezes threads of archived courses", async () => {
    const creatorId = await seedUser("creator"); const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", creatorId); await join(groupId, ownerId); await join(groupId, memberId);
    const setup = await publishedPractice("owner", groupId); const member = await signIn("member"); const creator = await signIn("creator");
    const mine = await answer(setup, member, ["Er is", "Er zijn"]);
    const theirs = await answer(setup, setup.owner, ["Er is", "Er zijn"]);
    expect((await request(`${setup.path}/comments/${theirs.id}`, member, undefined, "DELETE")).status).toBe(403);
    expect((await request(`${setup.path}/comments/${mine.id}`, member, undefined, "DELETE")).status).toBe(200);
    expect((await request(`${setup.path}/comments/${theirs.id}`, creator, undefined, "DELETE")).status).toBe(200);

    const kept = await answer(setup, member, ["Er is", ""]);
    await request(`${coursePath(groupId, setup.courseId)}/archive`, setup.owner, {});
    expect((await request(`${setup.path}/comments`, setup.owner, { kind: "practice_response", answers: ["a", "b"] })).status).toBe(409);
    expect((await request(`${setup.path}/comments/${kept.id}`, creator, undefined, "DELETE")).status).toBe(409);
    expect((await request(`${setup.path}/discussion`, setup.owner)).status).toBe(200);
    // Members cannot see archived courses at all.
    expect((await request(`${setup.path}/discussion`, member)).status).toBe(404);
  });

  it("isolates practice threads by tenant, nesting, visibility, and target", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const outsiderId = await seedUser("outsider");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const otherGroupId = await seedGroup("beta", outsiderId);
    const setup = await publishedPractice("owner", groupId);
    const other = await publishedPractice("outsider", otherGroupId);
    const reader = await signIn("reader"); const outsider = await signIn("outsider");
    const item = await answer(setup, reader, ["Er is", "Er zijn"]);

    // A non-member cannot reach the thread, and a member of another group cannot use its own group ID as a key.
    expect((await request(`${setup.path}/discussion`, outsider)).status).toBe(404);
    expect((await request(`${setup.path}/comments`, outsider, { kind: "practice_response", answers: ["a", "b"] })).status).toBe(404);
    const crossed = `/api/groups/${otherGroupId}/courses/${setup.courseId}/lessons/${setup.lessonId}/blocks/${setup.block.id}`;
    expect((await request(`${crossed}/discussion`, outsider)).status).toBe(404);
    // Another group's block, lesson, or course ID nested under a valid path is not found.
    const base = `${coursePath(groupId, setup.courseId)}/lessons/${setup.lessonId}/blocks`;
    expect((await request(`${base}/${other.block.id}/discussion`, setup.owner)).status).toBe(404);
    expect((await request(`${coursePath(groupId, setup.courseId)}/lessons/${other.lessonId}/blocks/${setup.block.id}/discussion`, setup.owner)).status).toBe(404);
    expect((await request(`${coursePath(groupId, other.courseId)}/lessons/${setup.lessonId}/blocks/${setup.block.id}/discussion`, setup.owner)).status).toBe(404);
    // A comment from one practice cannot be edited, deleted, or reacted to through another practice or through a post path.
    expect((await request(`${other.path}/comments/${item.id}`, outsider, undefined, "DELETE")).status).toBe(404);
    const sibling = blocks.practice(fillPractice); const paragraph = blocks.paragraph("Hallo");
    await republish(setup, blocks.practice(fillPractice, setup.block.id), sibling, paragraph);
    const siblingId = sibling.id;
    expect((await request(`${base}/${siblingId}/comments/${item.id}`, reader, { kind: "practice_response", answers: ["a", "b"] }, "PATCH")).status).toBe(404);
    expect((await request(`${base}/${siblingId}/comments/${item.id}/reactions`, reader, { emoji: "👍", active: true }, "PUT")).status).toBe(404);
    expect((await request(`/api/groups/${groupId}/posts/${setup.block.id}/comments/${item.id}`, reader, undefined, "DELETE")).status).toBe(404);

    // Draft-only practices and non-practice blocks have no thread for readers; editors may preview a draft-only practice.
    const hidden = blocks.practice(fillPractice);
    const current = await readLesson(setup.lessonPath, setup.owner);
    await saveDraft(setup.lessonPath, setup.owner, documentOf(...current.draft!.document.blocks, hidden), current.draft!.version);
    expect((await request(`${base}/${hidden.id}/discussion`, reader)).status).toBe(404);
    expect((await request(`${base}/${hidden.id}/discussion`, setup.owner)).status).toBe(200);
    expect((await request(`${base}/${paragraph.id}/discussion`, reader)).status).toBe(404);
    expect((await request(`${base}/${paragraph.id}/comments`, reader, { kind: "practice_response", answers: ["a"] })).status).toBe(404);
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
    expect(await thread(setup, reader)).toMatchObject({ items: [], count: 0 });
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
