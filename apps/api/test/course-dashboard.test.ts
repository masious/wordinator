import { env, SELF } from "cloudflare:test";
import { courseDashboardResponseSchema } from "@wordinator/contracts/learning";
import { beforeEach, describe, expect, it } from "vitest";
import { addLesson, blocks, createCourse, documentOf, errorCode, join, request, resetDatabase, seedGroup, seedUser, signIn, word } from "./courseApi";

beforeEach(resetDatabase);

async function setup() {
  const ownerId = await seedUser("owner"); const readerId = await seedUser("reader"); const otherId = await seedUser("other");
  const groupId = await seedGroup("alpha", ownerId); await join(groupId, readerId); await join(groupId, otherId);
  const owner = await signIn("owner"); const reader = await signIn("reader");
  const first = await createCourse(groupId, owner, true, { title: "First course", summary: "The opening path.", level: "A1" });
  const firstLesson = await addLesson(groupId, first.id, owner, "Introductions", { document: documentOf(blocks.paragraph("Hallo"), blocks.vocabulary(word("hallo"), word("dag"))) });
  const second = await createCourse(groupId, owner, true, { title: "Second course", summary: "The next path." });
  const secondLesson = await addLesson(groupId, second.id, owner, "Travel", { document: documentOf(blocks.paragraph("Trein"), blocks.vocabulary(word("trein"))) });
  return { ownerId, readerId, otherId, groupId, owner, reader, first, firstLesson, second, secondLesson };
}

describe("Course dashboard", () => {
  it("returns the viewer's resume target, recent lessons, bands, and not-started courses", async () => {
    const { readerId, otherId, groupId, reader, first, firstLesson, second, secondLesson } = await setup();
    await env.DB.prepare(`INSERT INTO course_lesson_positions (group_id, course_id, lesson_id, user_id, step_key, step_index, passed_steps, total_steps, updated_at)
      VALUES (?, ?, ?, ?, 'step', 1, 1, 2, 2000)`).bind(groupId, first.id, firstLesson.lesson.id, readerId).run();
    await env.DB.prepare(`INSERT INTO word_reviews (id, user_id, term_key, course_id, lesson_id, word_id, direction, result, source, created_at)
      VALUES ('review', ?, 'hallo', ?, ?, 'word', 'understand', 'got', 'drill', ?)`).bind(readerId, first.id, firstLesson.lesson.id, Date.now()).run();
    await env.DB.prepare(`INSERT INTO word_memory (user_id, term_key, direction, course_id, lesson_id, word_id, recent, reps, lapses, stability, difficulty, last_reviewed_at, known_override)
      VALUES (?, 'hallo', 'understand', ?, ?, 'word', 'g', 1, 0, 100, 5, ?, 0)`).bind(readerId, first.id, firstLesson.lesson.id, Date.now()).run();
    // Another account's later activity cannot affect the viewer's ordering or figures.
    await env.DB.prepare(`INSERT INTO course_lesson_positions (group_id, course_id, lesson_id, user_id, step_key, step_index, passed_steps, total_steps, updated_at)
      VALUES (?, ?, ?, ?, 'step', 0, 0, 2, 9000)`).bind(groupId, second.id, secondLesson.lesson.id, otherId).run();
    const response = await request(`/api/groups/${groupId}/course-dashboard`, reader);
    expect(response.status, await response.clone().text()).toBe(200);
    const dashboard = courseDashboardResponseSchema.parse(await response.json());
    expect(dashboard.resume).toMatchObject({ course: { id: first.id, coursePercent: 25 }, lesson: { id: firstLesson.lesson.id, storylinePercent: 50 } });
    expect(dashboard.recentLessons).toHaveLength(1);
    expect(dashboard.recentLessons[0]).toMatchObject({
      course: { id: first.id }, lesson: { id: firstLesson.lesson.id },
      metrics: { wordRecency: { recent: 1, total: 2 }, memory: { strong: 1, fading: 0, new: 1, total: 2 } },
    });
    expect(dashboard.notStarted.map((course) => course.id)).toEqual([second.id]);
  });

  it("requires the viewer's library and never exposes invisible courses", async () => {
    const { owner, reader, groupId } = await setup();
    const hidden = await createCourse(groupId, owner, false, { title: "Hidden", summary: "Owner only." });
    await addLesson(groupId, hidden.id, owner, "Secret", { document: documentOf(blocks.paragraph("Secret")) });
    const dashboard = courseDashboardResponseSchema.parse(await (await request(`/api/groups/${groupId}/course-dashboard`, reader)).json());
    expect(JSON.stringify(dashboard)).not.toContain(hidden.id);
    expect((await SELF.fetch(`https://wordinator.test/api/groups/${groupId}/course-dashboard`)).status).toBe(401);
    const outsiderId = await seedUser("outsider"); await seedGroup("beta", outsiderId);
    const outsider = await request(`/api/groups/${groupId}/course-dashboard`, await signIn("outsider"));
    expect(outsider.status).toBe(404);
    expect(await errorCode(outsider)).toBe("GROUP_NOT_FOUND");
  });
});
