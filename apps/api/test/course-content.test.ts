import { env, SELF } from "cloudflare:test";
import { blockResponseSchema, courseDetailResponseSchema, courseResponseSchema, lessonResponseSchema, outlineResponseSchema } from "@wordinator/contracts";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";
import { hashPassword } from "../src/auth";

const PASSWORD = "course-content-password";
let passwordHash: string;

async function seedUser(label: string) {
  const userId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)")
    .bind(userId, `${label}@example.test`, `${label}@example.test`, passwordHash, label, now, now).run();
  return userId;
}

async function seedGroup(label: string, creatorId: string) {
  const groupId = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, 'nl', ?, ?, ?)")
    .bind(groupId, creatorId, `${label} group`, `${label}-${"x".repeat(40)}`, now, now).run();
  await join(groupId, creatorId);
  return groupId;
}

async function join(groupId: string, userId: string, state = "active") {
  const now = Date.now();
  await env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, ?, ?, ?, 'Member', ?)")
    .bind(groupId, userId, state, now, now, now).run();
}

async function signIn(label: string) {
  const response = await SELF.fetch("https://wordinator.test/api/auth/sign-in", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${label}@example.test`, password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";", 1)[0]!;
}

async function request(path: string, cookie: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  return SELF.fetch(`https://wordinator.test${path}`, {
    method, headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createCourse(groupId: string, cookie: string, publish = true) {
  const response = await request(`/api/groups/${groupId}/courses`, cookie, fixture.course);
  const course = courseResponseSchema.parse(await response.json()).course;
  if (publish) await request(`/api/groups/${groupId}/courses/${course.id}/visibility`, cookie, { status: "published" });
  return course;
}

const coursePath = (groupId: string, courseId: string) => `/api/groups/${groupId}/courses/${courseId}`;

async function addLesson(groupId: string, courseId: string, cookie: string, title: string, published = true) {
  const created = await request(`${coursePath(groupId, courseId)}/lessons`, cookie, { title, goal: null });
  expect(created.status).toBe(201);
  const lesson = lessonResponseSchema.parse(await created.json()).lesson;
  if (!published) return lesson;
  const updated = await request(`${coursePath(groupId, courseId)}/lessons/${lesson.id}`, cookie, { title, goal: null, published: true, version: lesson.version }, "PATCH");
  return lessonResponseSchema.parse(await updated.json()).lesson;
}

async function addBlock(groupId: string, courseId: string, lessonId: string, cookie: string, body: unknown) {
  const created = await request(`${coursePath(groupId, courseId)}/lessons/${lessonId}/blocks`, cookie, body);
  expect(created.status).toBe(201);
  return blockResponseSchema.parse(await created.json()).block;
}

const detail = async (groupId: string, courseId: string, cookie: string) => courseDetailResponseSchema.parse(await (await request(coursePath(groupId, courseId), cookie)).json());

beforeAll(async () => { passwordHash = await hashPassword(PASSWORD); });
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM posts"), env.DB.prepare("DELETE FROM course_blocks"), env.DB.prepare("DELETE FROM course_lessons"), env.DB.prepare("DELETE FROM courses"),
    env.DB.prepare("DELETE FROM login_attempts"), env.DB.prepare("DELETE FROM notifications"),
    env.DB.prepare("DELETE FROM memberships"), env.DB.prepare("DELETE FROM groups"), env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("Course lessons and blocks API", () => {
  it("stores the acceptance fixture lesson by lesson and pages lesson content for readers", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const owner = await signIn("owner"); const reader = await signIn("reader");
    const course = await createCourse(groupId, owner);
    for (const source of fixture.lessons) {
      const lesson = await addLesson(groupId, course.id, owner, source.title);
      for (const block of source.blocks) {
        await addBlock(groupId, course.id, lesson.id, owner, { ...block, published: true });
      }
    }
    const read = await detail(groupId, course.id, reader);
    expect(read.outline.map((lesson) => lesson.title)).toEqual(fixture.lessons.map((lesson) => lesson.title));
    expect(read.outline.map((lesson) => lesson.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(read.lessons.map((lesson) => lesson.id)).toEqual(read.outline.slice(0, 3).map((lesson) => lesson.id));
    const expectedFirst = fixture.lessons[0]!.blocks.filter((entry) => entry.kind !== "practice");
    expect(read.lessons[0]!.blocks.filter((block) => block.kind !== "practice").map(({ kind, payload }) => ({ kind, payload }))).toEqual(expectedFirst);
    expect(read.lessons[0]!.blocks.filter((block) => block.kind === "practice")).toHaveLength(fixture.lessons[0]!.blocks.filter((entry) => entry.kind === "practice").length);
    expect(read.lessons[0]!.blocks[0]!.updatedBy.displayName).toBe("owner");

    const fourth = lessonResponseSchema.parse(await (await request(`${coursePath(groupId, course.id)}/lessons/${read.outline[3]!.id}`, reader)).json()).lesson;
    expect(fourth.title).toBe("Onderweg");
    expect(fourth.blocks[0]).toMatchObject({ kind: "heading", payload: { title: "Instappen, uitstappen en overstappen" } });
  });

  it("hides unpublished lessons and blocks from readers and preloads only visible lessons", async () => {
    const ownerId = await seedUser("owner"); const readerId = await seedUser("reader");
    const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId);
    const owner = await signIn("owner"); const reader = await signIn("reader");
    const course = await createCourse(groupId, owner);
    const draft = await addLesson(groupId, course.id, owner, "Draft lesson", false);
    const visible = await addLesson(groupId, course.id, owner, "Visible lesson");
    const hiddenBlock = await addBlock(groupId, course.id, visible.id, owner, { kind: "text", payload: { content: "Still drafting" } });
    expect(hiddenBlock.published).toBe(false);
    await addBlock(groupId, course.id, visible.id, owner, { kind: "heading", payload: { title: "Ready" }, published: true });

    const ownerView = await detail(groupId, course.id, owner);
    expect(ownerView.outline.map((lesson) => lesson.id)).toEqual([draft.id, visible.id]);
    expect(ownerView.lessons[1]!.blocks).toHaveLength(2);
    const readerView = await detail(groupId, course.id, reader);
    expect(readerView.outline.map((lesson) => lesson.id)).toEqual([visible.id]);
    expect(readerView.lessons[0]!.blocks.map((block) => block.kind)).toEqual(["heading"]);
    expect((await request(`${coursePath(groupId, course.id)}/lessons/${draft.id}`, reader)).status).toBe(404);
    expect((await request(`${coursePath(groupId, course.id)}/lessons/${draft.id}`, owner)).status).toBe(200);
  });

  it("rejects stale versions, kind changes, invalid payloads, and limits", async () => {
    const ownerId = await seedUser("owner");
    const groupId = await seedGroup("alpha", ownerId); const owner = await signIn("owner");
    const course = await createCourse(groupId, owner);
    const lesson = await addLesson(groupId, course.id, owner, "Mijn huis", false);
    const lessonPath = `${coursePath(groupId, course.id)}/lessons/${lesson.id}`;
    const saved = lessonResponseSchema.parse(await (await request(lessonPath, owner, { title: "Mijn huis", goal: "Rooms", published: false, version: 1 }, "PATCH")).json()).lesson;
    expect(saved).toMatchObject({ version: 2, goal: "Rooms" });
    const staleLesson = await request(lessonPath, owner, { title: "Overwrite", goal: null, published: true, version: 1 }, "PATCH");
    expect(staleLesson.status).toBe(409);
    expect(await staleLesson.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });

    const block = await addBlock(groupId, course.id, lesson.id, owner, { kind: "example", payload: { sentence: "Er is een balkon.", translation: "", note: null } });
    expect(block).toMatchObject({ version: 1, payload: { translation: null } });
    const blockPath = `${lessonPath}/blocks/${block.id}`;
    const edited = blockResponseSchema.parse(await (await request(blockPath, owner, { kind: "example", payload: { sentence: "Er is een tuin." }, published: true, version: 1 }, "PATCH")).json()).block;
    expect(edited).toMatchObject({ version: 2, published: true, payload: { sentence: "Er is een tuin.", translation: null, note: null } });
    expect((await request(blockPath, owner, { kind: "example", payload: { sentence: "Stale" }, published: true, version: 1 }, "PATCH")).status).toBe(409);
    const kindChange = await request(blockPath, owner, { kind: "text", payload: { content: "x" }, published: true, version: 2 }, "PATCH");
    expect(kindChange.status).toBe(400);
    expect(await kindChange.json()).toMatchObject({ error: { code: "BLOCK_KIND_IMMUTABLE" } });
    expect((await request(`${lessonPath}/blocks`, owner, { kind: "heading", payload: { title: "x".repeat(201) } })).status).toBe(400);
    expect((await request(`${lessonPath}/blocks`, owner, { kind: "practice", payload: { instruction: "x", items: [] } })).status).toBe(400);
    expect((await request(`${coursePath(groupId, course.id)}/lessons`, owner, { title: " " })).status).toBe(400);

    const now = Date.now();
    await env.DB.batch(Array.from({ length: 199 }, (_, index) => env.DB.prepare(
      "INSERT INTO course_blocks (id, group_id, course_id, lesson_id, position, kind, payload, payload_version, published, version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'heading', '{\"title\":\"x\"}', 1, 0, 1, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), groupId, course.id, lesson.id, index + 1, ownerId, ownerId, now, now)));
    const overLimit = await request(`${lessonPath}/blocks`, owner, { kind: "heading", payload: { title: "One too many" } });
    expect(overLimit.status).toBe(409);
    expect(await overLimit.json()).toMatchObject({ error: { code: "BLOCK_LIMIT_REACHED" } });
  });

  it("reorders one parent from the complete ID list and rejects stale lists", async () => {
    const ownerId = await seedUser("owner");
    const groupId = await seedGroup("alpha", ownerId); const owner = await signIn("owner");
    const course = await createCourse(groupId, owner);
    const [a, b, c] = [await addLesson(groupId, course.id, owner, "A"), await addLesson(groupId, course.id, owner, "B"), await addLesson(groupId, course.id, owner, "C")];
    const orderPath = `${coursePath(groupId, course.id)}/lessons/order`;
    const reordered = outlineResponseSchema.parse(await (await request(orderPath, owner, { ids: [c!.id, a!.id, b!.id] }, "PUT")).json());
    expect(reordered.outline.map((lesson) => lesson.title)).toEqual(["C", "A", "B"]);
    expect(reordered.outline.find((lesson) => lesson.id === c!.id)!.version).toBe(c!.version);
    for (const ids of [[a!.id, b!.id], [a!.id, a!.id, b!.id], [a!.id, b!.id, crypto.randomUUID()], [a!.id, b!.id, c!.id, crypto.randomUUID()]]) {
      const stale = await request(orderPath, owner, { ids }, "PUT");
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ error: { code: "ORDER_STALE" } });
    }

    const one = await addBlock(groupId, course.id, a!.id, owner, { kind: "heading", payload: { title: "One" } });
    const two = await addBlock(groupId, course.id, a!.id, owner, { kind: "text", payload: { content: "Two" } });
    const blocksPath = `${coursePath(groupId, course.id)}/lessons/${a!.id}/blocks/order`;
    const lesson = lessonResponseSchema.parse(await (await request(blocksPath, owner, { ids: [two.id, one.id] }, "PUT")).json()).lesson;
    expect(lesson.blocks.map((block) => block.id)).toEqual([two.id, one.id]);
    expect((await request(blocksPath, owner, { ids: [two.id] }, "PUT")).status).toBe(409);
  });

  it("limits editing to the owner, lets the group creator delete as moderation, and freezes archived courses", async () => {
    const creatorId = await seedUser("creator"); const ownerId = await seedUser("owner"); const memberId = await seedUser("member");
    const groupId = await seedGroup("alpha", creatorId); await join(groupId, ownerId); await join(groupId, memberId);
    const creator = await signIn("creator"); const owner = await signIn("owner"); const member = await signIn("member");
    const course = await createCourse(groupId, owner);
    const lesson = await addLesson(groupId, course.id, owner, "Mijn huis");
    const block = await addBlock(groupId, course.id, lesson.id, owner, { kind: "text", payload: { content: "Hallo" }, published: true });
    const doomed = await addBlock(groupId, course.id, lesson.id, owner, { kind: "text", payload: { content: "Remove me" }, published: true });
    const lessonPath = `${coursePath(groupId, course.id)}/lessons/${lesson.id}`;
    for (const cookie of [member, creator]) {
      expect((await request(`${coursePath(groupId, course.id)}/lessons`, cookie, { title: "Mine" })).status).toBe(403);
      expect((await request(lessonPath, cookie, { title: "Taken", published: true, version: lesson.version }, "PATCH")).status).toBe(403);
      expect((await request(`${lessonPath}/blocks`, cookie, { kind: "text", payload: { content: "x" } })).status).toBe(403);
      expect((await request(`${lessonPath}/blocks/${block.id}`, cookie, { kind: "text", payload: { content: "x" }, published: true, version: 1 }, "PATCH")).status).toBe(403);
      expect((await request(`${coursePath(groupId, course.id)}/lessons/order`, cookie, { ids: [lesson.id] }, "PUT")).status).toBe(403);
    }
    expect((await request(`${lessonPath}/blocks/${block.id}`, member, undefined, "DELETE")).status).toBe(403);
    expect((await request(lessonPath, member, undefined, "DELETE")).status).toBe(403);
    expect((await request(`${lessonPath}/blocks/${doomed.id}`, creator, undefined, "DELETE")).status).toBe(200);

    await request(`${coursePath(groupId, course.id)}/archive`, owner, undefined, "POST");
    expect((await request(`${lessonPath}/blocks`, owner, { kind: "text", payload: { content: "x" } })).status).toBe(409);
    expect((await request(lessonPath, owner, { title: "x", published: true, version: lesson.version }, "PATCH")).status).toBe(409);
    expect((await request(`${lessonPath}/blocks/${block.id}`, creator, undefined, "DELETE")).status).toBe(409);
    expect((await detail(groupId, course.id, owner)).lessons[0]!.blocks.map((entry) => entry.id)).toEqual([block.id]);

    await request(`${coursePath(groupId, course.id)}/restore`, owner, undefined, "POST");
    await request(`${coursePath(groupId, course.id)}/visibility`, owner, { status: "published" });
    expect((await request(lessonPath, creator, undefined, "DELETE")).status).toBe(200);
    // Lesson deletion is hard deletion of the lesson and every block in it.
    const left = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM course_lessons) AS lessons, (SELECT COUNT(*) FROM course_blocks) AS blocks").first<{ lessons: number; blocks: number }>();
    expect(left).toEqual({ lessons: 0, blocks: 0 });
  });

  it("rejects cross-tenant, nested-ID, and inactive-member access", async () => {
    const alphaId = await seedUser("alpha"); const betaId = await seedUser("beta"); const formerId = await seedUser("former");
    const alphaGroup = await seedGroup("alpha", alphaId); const betaGroup = await seedGroup("beta", betaId);
    await join(alphaGroup, formerId, "left");
    const alpha = await signIn("alpha"); const beta = await signIn("beta"); const former = await signIn("former");
    const alphaCourse = await createCourse(alphaGroup, alpha);
    const alphaLesson = await addLesson(alphaGroup, alphaCourse.id, alpha, "Alpha lesson");
    const otherLesson = await addLesson(alphaGroup, alphaCourse.id, alpha, "Other alpha lesson");
    const alphaBlock = await addBlock(alphaGroup, alphaCourse.id, alphaLesson.id, alpha, { kind: "text", payload: { content: "Private" }, published: true });
    const betaCourse = await createCourse(betaGroup, beta);
    const betaLesson = await addLesson(betaGroup, betaCourse.id, beta, "Beta lesson");
    const secondAlphaCourse = await createCourse(alphaGroup, alpha);

    const alphaLessonPath = `${coursePath(alphaGroup, alphaCourse.id)}/lessons/${alphaLesson.id}`;
    for (const cookie of [beta, former]) {
      expect((await request(alphaLessonPath, cookie)).status).toBe(404);
      expect((await request(alphaLessonPath, cookie, { title: "x", published: true, version: 1 }, "PATCH")).status).toBe(404);
      expect((await request(alphaLessonPath, cookie, undefined, "DELETE")).status).toBe(404);
      expect((await request(`${alphaLessonPath}/blocks`, cookie, { kind: "text", payload: { content: "x" } })).status).toBe(404);
      expect((await request(`${alphaLessonPath}/blocks/${alphaBlock.id}`, cookie, undefined, "DELETE")).status).toBe(404);
    }
    // Another group's course, lesson, and block IDs under the attacker's own valid group, course, and lesson.
    const betaCoursePath = coursePath(betaGroup, betaCourse.id);
    expect((await request(`${coursePath(betaGroup, alphaCourse.id)}/lessons/${alphaLesson.id}`, beta)).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/${alphaLesson.id}`, beta)).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/${alphaLesson.id}`, beta, { title: "x", published: true, version: 1 }, "PATCH")).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/${alphaLesson.id}`, beta, undefined, "DELETE")).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/${alphaLesson.id}/blocks`, beta, { kind: "text", payload: { content: "x" } })).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/${betaLesson.id}/blocks/${alphaBlock.id}`, beta, { kind: "text", payload: { content: "x" }, published: true, version: 1 }, "PATCH")).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/${betaLesson.id}/blocks/${alphaBlock.id}`, beta, undefined, "DELETE")).status).toBe(404);
    expect((await request(`${betaCoursePath}/lessons/order`, beta, { ids: [betaLesson.id, alphaLesson.id] }, "PUT")).status).toBe(409);
    expect((await request(`${betaCoursePath}/lessons/${betaLesson.id}/blocks/order`, beta, { ids: [alphaBlock.id] }, "PUT")).status).toBe(409);
    // Mismatched nesting inside one group: a block under the wrong lesson and a lesson under the wrong course.
    expect((await request(`${coursePath(alphaGroup, alphaCourse.id)}/lessons/${otherLesson.id}/blocks/${alphaBlock.id}`, alpha, undefined, "DELETE")).status).toBe(404);
    expect((await request(`${coursePath(alphaGroup, secondAlphaCourse.id)}/lessons/${alphaLesson.id}`, alpha)).status).toBe(404);

    const unchanged = await detail(alphaGroup, alphaCourse.id, alpha);
    expect(unchanged.outline.map((lesson) => lesson.id)).toEqual([alphaLesson.id, otherLesson.id]);
    expect(unchanged.lessons[0]!.blocks).toMatchObject([{ id: alphaBlock.id, payload: { content: "Private" }, version: 1 }]);
  });
});
