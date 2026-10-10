import { env } from "cloudflare:test";
import { courseBlockPayloadSchemas, outlineResponseSchema, type CourseBlockKind } from "@wordinator/contracts";
import {
  courseDetailResponseSchema, lessonDraftConflictSchema, lessonNotReadySchema, lessonResponseSchema, upgradeLegacyBlocks,
} from "@wordinator/contracts/lesson-document";
import { beforeEach, describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import {
  addLesson, blocks, coursePath, createCourse, documentOf, errorCode, join, lessonPath, publishLesson, readLesson, request, resetDatabase, saveDraft, seedGroup,
  seedUser, signIn,
} from "./courseApi";

// The acceptance fixture is written in the v1 block shape; each lesson becomes a document exactly as migration 0015 does.
const fixtureDocument = (index: number) => upgradeLegacyBlocks(fixture.lessons[index]!.blocks.map((block) => ({
  id: crypto.randomUUID(), kind: block.kind, payload: courseBlockPayloadSchemas[block.kind as CourseBlockKind].parse(block.payload),
})));
const detail = async (groupId: string, courseId: string, cookie: string) => courseDetailResponseSchema.parse(await (await request(coursePath(groupId, courseId), cookie)).json());

beforeEach(resetDatabase);

describe("Course lessons and lesson documents API", () => {
  it("stores the acceptance fixture as documents and pages published lessons for readers", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const owner = await signIn("owner"); const reader = await signIn("reader");
    const course = await createCourse(groupId, owner, true, fixture.course);
    for (const [index, source] of fixture.lessons.entries()) await addLesson(groupId, course.id, owner, source.title, { document: fixtureDocument(index) });

    const read = await detail(groupId, course.id, reader);
    expect(read.outline.map((lesson) => lesson.title)).toEqual(fixture.lessons.map((lesson) => lesson.title));
    expect(read.outline.map((lesson) => lesson.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(read.outline.every((lesson) => lesson.published && !lesson.changed)).toBe(true);
    expect(read.lessons.map((lesson) => lesson.id)).toEqual(read.outline.slice(0, 3).map((lesson) => lesson.id));
    const first = read.lessons[0]!;
    expect(first.draft).toBeNull();
    expect(first.document!.blocks.map((block) => block.type)).toEqual(fixtureDocument(0).blocks.map((block) => block.type));
    expect(first.updatedBy.displayName).toBe("owner");
    // Every practice has an anchor and empty progress.
    expect(Object.values(first.practiceProgress)).toEqual(Array(6).fill({ done: 0, started: 0, answered: null }));

    const fourth = await readLesson(lessonPath(groupId, course.id, read.outline[3]!.id), reader);
    expect(fourth.title).toBe("Onderweg");
    expect(fourth.document!.blocks[0]).toMatchObject({ type: "heading", content: [{ text: "Instappen, uitstappen en overstappen" }] });
  });

  it("keeps drafts private, publishes by draft version, and reports unpublished changes to editors", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const owner = await signIn("owner"); const reader = await signIn("reader");
    const course = await createCourse(groupId, owner);
    const { lesson, path } = await addLesson(groupId, course.id, owner, "Mijn huis", { published: false });
    expect(lesson).toMatchObject({ published: false, document: null, draft: { version: 1, document: { blocks: [] } } });
    expect((await request(path, reader)).status).toBe(404);
    expect((await detail(groupId, course.id, reader)).outline).toEqual([]);

    const ready = documentOf(blocks.heading("Er is en er zijn"), blocks.paragraph("Use 'er is' for one thing.\nAnd 'er zijn' for more."));
    const saved = await saveDraft(path, owner, ready, 1);
    expect(saved).toMatchObject({ draftVersion: 2, changed: false, updatedBy: { id: ownerId } });
    const stale = await request(`${path}/draft`, owner, { document: documentOf(), draftVersion: 1 }, "PUT");
    expect(stale.status).toBe(409);
    expect(lessonDraftConflictSchema.parse(await stale.json()).draft).toEqual({ document: ready, version: 2 });
    expect((await request(`${path}/publish`, owner, { draftVersion: 1 })).status).toBe(409);

    const published = await publishLesson(path, owner, 2);
    expect(published).toMatchObject({ published: true, changed: false, document: ready, draft: { version: 2 } });
    expect(published.publishedAt).toEqual(expect.any(Number));
    expect((await readLesson(path, reader)).document).toEqual(ready);

    // Draft edits after publishing stay invisible to readers until the next publish.
    const edited = documentOf(...ready.blocks, blocks.paragraph("A new paragraph"));
    expect(await saveDraft(path, owner, edited, 2)).toMatchObject({ draftVersion: 3, changed: true });
    const asReader = await readLesson(path, reader);
    expect(asReader).toMatchObject({ document: ready, draft: null, changed: false });
    expect(JSON.stringify(asReader)).not.toContain("A new paragraph");
    expect((await detail(groupId, course.id, owner)).outline[0]).toMatchObject({ changed: true });

    // Discarding returns the draft to the published document; unpublishing hides the lesson again.
    const discarded = lessonResponseSchema.parse(await (await request(`${path}/discard`, owner, {})).json()).lesson;
    expect(discarded).toMatchObject({ changed: false, draft: { document: ready, version: 4 } });
    const unpublished = lessonResponseSchema.parse(await (await request(`${path}/unpublish`, owner, {})).json()).lesson;
    expect(unpublished).toMatchObject({ published: false, publishedAt: null, document: null, draft: { document: ready } });
    expect((await request(path, reader)).status).toBe(404);
    expect(await errorCode(await request(`${path}/discard`, owner, {}))).toBe("LESSON_UNPUBLISHED");
  });

  it("rejects documents outside the contract, unfinished documents at publish, and oversized requests", async () => {
    const ownerId = await seedUser("owner");
    const groupId = await seedGroup("alpha", ownerId); const owner = await signIn("owner");
    const course = await createCourse(groupId, owner);
    const { path } = await addLesson(groupId, course.id, owner, "Mijn huis", { published: false });
    const hostile = [
      documentOf({ ...blocks.paragraph("x"), content: [{ type: "text", text: "x", styles: { underline: true } }] }),
      documentOf({ ...blocks.paragraph("x"), content: [{ type: "link", href: "javascript:alert(1)", content: [{ type: "text", text: "x", styles: {} }] }] }),
      documentOf({ ...blocks.paragraph("x"), type: "html", props: {} }),
      documentOf(blocks.practice({ instruction: "x", items: [] })),
      { schemaVersion: 1, blocks: [] },
    ];
    for (const document of hostile) expect(await errorCode(await request(`${path}/draft`, owner, { document, draftVersion: 1 }, "PUT"))).toBe("VALIDATION_ERROR");
    const huge = await request(`${path}/draft`, owner, { document: documentOf(...Array.from({ length: 40 }, () => blocks.paragraph("x".repeat(9_000)))), draftVersion: 1 }, "PUT");
    expect(huge.status).toBe(413);

    const unfinished = documentOf(blocks.example(""), blocks.image(""), blocks.paragraph("Fine"));
    await saveDraft(path, owner, unfinished, 1);
    const refused = await request(`${path}/publish`, owner, { draftVersion: 2 });
    expect(refused.status).toBe(422);
    expect(lessonNotReadySchema.parse(await refused.json()).problems).toEqual([
      { blockId: unfinished.blocks[0]!.id, problem: "example-empty" }, { blockId: unfinished.blocks[1]!.id, problem: "image-missing" },
    ]);
    // Image URLs must be uploads of this lesson; arbitrary URLs are refused even though they are well formed.
    const foreign = await request(`${path}/draft`, owner, { document: documentOf(blocks.image("https://example.com/cat.png")), draftVersion: 2 }, "PUT");
    expect(await errorCode(foreign)).toBe("LESSON_IMAGE_INVALID");
    expect((await request(`${coursePath(groupId, course.id)}/lessons`, owner, { title: " " })).status).toBe(400);
  });

  it("anchors practices to one lesson and cleans up threads of practices that publishing removes", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const owner = await signIn("owner"); const reader = await signIn("reader");
    const course = await createCourse(groupId, owner);
    const practice = { instruction: "Vul in.", items: [{ prompt: "… een tuin.", authorsVersion: ["Er is"] }] };
    const kept = blocks.practice(practice); const removed = blocks.practice(practice);
    const { path, lesson } = await addLesson(groupId, course.id, owner, "One", { document: documentOf(kept, removed) });
    const other = await addLesson(groupId, course.id, owner, "Two", { published: false });
    // Another lesson cannot take over a practice ID and with it the progress.
    const stolen = await request(`${other.path}/draft`, owner, { document: documentOf(blocks.practice(practice, kept.id)), draftVersion: 1 }, "PUT");
    expect(stolen.status).toBe(409);
    expect(await errorCode(stolen)).toBe("PRACTICE_ID_TAKEN");
    expect((await readLesson(other.path, owner)).draft!.version).toBe(1);

    for (const block of [kept, removed]) expect((await request(`${path}/blocks/${block.id}/progress`, reader, { answered: 1 }, "PUT")).status).toBe(200);
    const done = { done: 1, started: 1, answered: null };
    expect((await readLesson(path, owner)).practiceProgress).toEqual({ [kept.id]: done, [removed.id]: done });

    // Removing a practice from the draft keeps its progress while the published document still has it.
    await saveDraft(path, owner, documentOf(kept), lesson.draft!.version);
    expect((await request(`${path}/blocks/${removed.id}/progress`, reader, { answered: 1 }, "PUT")).status).toBe(200);
    const current = await readLesson(path, owner);
    expect(current.practiceProgress).toEqual({ [kept.id]: done, [removed.id]: done });
    await publishLesson(path, owner, current.draft!.version);
    expect((await request(`${path}/blocks/${removed.id}/progress`, reader, { answered: 1 }, "PUT")).status).toBe(404);
    const left = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM course_practices) AS practices, (SELECT COUNT(*) FROM course_practice_progress) AS progress").first();
    expect(left).toEqual({ practices: 1, progress: 1 });
  });

  it("reorders lessons from the complete ID list and rejects stale lists", async () => {
    const ownerId = await seedUser("owner");
    const groupId = await seedGroup("alpha", ownerId); const owner = await signIn("owner");
    const course = await createCourse(groupId, owner);
    const [a, b, c] = [
      (await addLesson(groupId, course.id, owner, "A")).lesson, (await addLesson(groupId, course.id, owner, "B")).lesson, (await addLesson(groupId, course.id, owner, "C")).lesson,
    ];
    const orderPath = `${coursePath(groupId, course.id)}/lessons/order`;
    const reordered = outlineResponseSchema.parse(await (await request(orderPath, owner, { ids: [c.id, a.id, b.id] }, "PUT")).json());
    expect(reordered.outline.map((lesson) => lesson.title)).toEqual(["C", "A", "B"]);
    for (const ids of [[a.id, b.id], [a.id, a.id, b.id], [a.id, b.id, crypto.randomUUID()], [a.id, b.id, c.id, crypto.randomUUID()]]) {
      const stale = await request(orderPath, owner, { ids }, "PUT");
      expect(stale.status).toBe(409);
      expect(await errorCode(stale)).toBe("ORDER_STALE");
    }
    // Lesson details are edited without a version.
    const renamed = lessonResponseSchema.parse(await (await request(lessonPath(groupId, course.id, a.id), owner, { title: "A, revised", goal: "Rooms" }, "PATCH")).json()).lesson;
    expect(renamed).toMatchObject({ title: "A, revised", goal: "Rooms", published: true });
  });

  it("limits editing to the owner, lets the group creator delete as moderation, and freezes archived courses", async () => {
    const creatorId = await seedUser("creator"); const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", creatorId); await join(groupId, ownerId); await join(groupId, memberId);
    const creator = await signIn("creator"); const owner = await signIn("owner"); const member = await signIn("member");
    const course = await createCourse(groupId, owner);
    const { lesson, path } = await addLesson(groupId, course.id, owner, "Mijn huis", { document: documentOf(blocks.paragraph("Hallo")) });
    const version = lesson.draft!.version;
    for (const cookie of [member, creator]) {
      expect((await request(`${coursePath(groupId, course.id)}/lessons`, cookie, { title: "Mine" })).status).toBe(403);
      expect((await request(path, cookie, { title: "Taken" }, "PATCH")).status).toBe(403);
      expect((await request(`${path}/draft`, cookie, { document: documentOf(), draftVersion: version }, "PUT")).status).toBe(403);
      for (const action of ["publish", "unpublish", "discard"]) expect(await errorCode(await request(`${path}/${action}`, cookie, { draftVersion: version }))).toBe("COURSE_EDIT_FORBIDDEN");
      expect((await request(`${coursePath(groupId, course.id)}/lessons/order`, cookie, { ids: [lesson.id] }, "PUT")).status).toBe(403);
      // Readers never receive the draft.
      expect((await readLesson(path, cookie)).draft).toBeNull();
    }
    expect((await request(path, member, undefined, "DELETE")).status).toBe(403);

    await request(`${coursePath(groupId, course.id)}/archive`, owner, undefined, "POST");
    expect((await request(`${path}/draft`, owner, { document: documentOf(), draftVersion: version }, "PUT")).status).toBe(409);
    expect((await request(`${path}/publish`, owner, { draftVersion: version })).status).toBe(409);
    expect((await request(path, owner, { title: "x" }, "PATCH")).status).toBe(409);
    expect((await request(path, creator, undefined, "DELETE")).status).toBe(409);

    await request(`${coursePath(groupId, course.id)}/restore`, owner, undefined, "POST");
    await request(`${coursePath(groupId, course.id)}/visibility`, owner, { status: "published" });
    expect((await request(path, creator, undefined, "DELETE")).status).toBe(200);
    const left = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM course_lessons) AS lessons, (SELECT COUNT(*) FROM course_practices) AS practices").first();
    expect(left).toEqual({ lessons: 0, practices: 0 });
  });

  it("rejects cross-tenant, nested-ID, and inactive-member access", async () => {
    const alphaId = await seedUser("alpha"); const betaId = await seedUser("beta"); const formerId = await seedUser("former");
    const alphaGroup = await seedGroup("alpha", alphaId); const betaGroup = await seedGroup("beta", betaId);
    await join(alphaGroup, formerId, "left");
    const alpha = await signIn("alpha"); const beta = await signIn("beta"); const former = await signIn("former");
    const alphaCourse = await createCourse(alphaGroup, alpha);
    const alphaLesson = await addLesson(alphaGroup, alphaCourse.id, alpha, "Alpha lesson", { document: documentOf(blocks.paragraph("Private")) });
    const otherLesson = await addLesson(alphaGroup, alphaCourse.id, alpha, "Other alpha lesson");
    const betaCourse = await createCourse(betaGroup, beta);
    const betaLesson = await addLesson(betaGroup, betaCourse.id, beta, "Beta lesson");
    const secondAlphaCourse = await createCourse(alphaGroup, alpha);
    const version = alphaLesson.lesson.draft!.version;

    const attempts = (path: string) => [
      request(path, beta), request(path, beta, { title: "x" }, "PATCH"), request(path, beta, undefined, "DELETE"),
      request(`${path}/draft`, beta, { document: documentOf(), draftVersion: version }, "PUT"), request(`${path}/publish`, beta, { draftVersion: version }),
      request(`${path}/unpublish`, beta, {}), request(`${path}/discard`, beta, {}),
    ];
    for (const response of await Promise.all(attempts(alphaLesson.path))) expect(response.status).toBe(404);
    for (const response of [await request(alphaLesson.path, former), await request(`${alphaLesson.path}/draft`, former, { document: documentOf(), draftVersion: version }, "PUT")]) {
      expect(response.status).toBe(404);
    }
    // Another group's course and lesson IDs under the attacker's own valid group and course.
    for (const response of await Promise.all([
      ...attempts(lessonPath(betaGroup, alphaCourse.id, alphaLesson.lesson.id)), ...attempts(lessonPath(betaGroup, betaCourse.id, alphaLesson.lesson.id)),
    ])) expect(response.status).toBe(404);
    expect((await request(`${coursePath(betaGroup, betaCourse.id)}/lessons/order`, beta, { ids: [betaLesson.lesson.id, alphaLesson.lesson.id] }, "PUT")).status).toBe(409);
    // Mismatched nesting inside one group: a lesson under the wrong course.
    expect((await request(lessonPath(alphaGroup, secondAlphaCourse.id, alphaLesson.lesson.id), alpha)).status).toBe(404);
    expect((await request(`${lessonPath(alphaGroup, secondAlphaCourse.id, alphaLesson.lesson.id)}/draft`, alpha, { document: documentOf(), draftVersion: version }, "PUT")).status).toBe(404);

    const unchanged = await detail(alphaGroup, alphaCourse.id, alpha);
    expect(unchanged.outline.map((lesson) => lesson.id)).toEqual([alphaLesson.lesson.id, otherLesson.lesson.id]);
    expect(unchanged.lessons[0]).toMatchObject({ document: { blocks: [{ content: [{ text: "Private" }] }] }, draft: { version } });
  });
});
