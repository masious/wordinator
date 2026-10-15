import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, inject, it } from "vitest";
import { rebuildWordMemory, SEED_STABILITY_DAYS, WORD_DEFAULT_DIFFICULTY, type FoldableWordReview } from "../src/wordMemory";

// Migration 0026 (C14a, docs/words.md#word-memory): seeds word reviews and memory from C12's drill states, then drops them.
// A separate database is seeded in the shape before 0026, so the migration runs against real drill states.
const legacy = (env as unknown as { MIGRATION_DB: D1Database }).MIGRATION_DB;
const migrations = inject("migrations");

async function seedDrillStates() {
  await applyD1Migrations(legacy, migrations.filter((migration) => migration.name < "0026_"));
  const now = Date.now(); const id = () => crypto.randomUUID();
  const [ana, ben, groupId, courseId, one, two] = [id(), id(), id(), id(), id(), id()];
  const words = { hond: id(), vrij: id(), vrijToo: id(), uber: id(), plain: id(), gone: id() };
  const user = (userId: string, name: string) => legacy.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 'x', ?, 0, ?, ?)")
    .bind(userId, `${name}@example.test`, `${name}@example.test`, name, now, now);
  const lesson = (lessonId: string, position: number) => legacy.prepare("INSERT INTO course_lessons (id, group_id, course_id, title, position, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Lesson', ?, ?, ?, ?, ?)")
    .bind(lessonId, groupId, courseId, position, ana, ana, now, now);
  const indexed = (lessonId: string, wordId: string, term: string, termKey: string | null) => legacy.prepare(
    "INSERT INTO course_lesson_words (group_id, course_id, lesson_id, block_id, word_id, position, term, meaning, term_key, search_key) VALUES (?, ?, ?, 'block', ?, 0, ?, 'meaning', ?, NULL)",
  ).bind(groupId, courseId, lessonId, wordId, term, termKey);
  const state = (userId: string, lessonId: string, wordId: string, direction: string, box: number, at: number) => legacy.prepare(
    "INSERT INTO course_word_drill_states (user_id, course_id, lesson_id, word_id, direction, box, last_result, last_drilled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(userId, courseId, lessonId, wordId, direction, box, box === 1 ? "again" : "got", at);
  await legacy.batch([
    user(ana, "ana"), user(ben, "ben"),
    legacy.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Library', 'nl', ?, ?, ?)").bind(groupId, ana, "m".repeat(40), now, now),
    legacy.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, ana, now, now),
    lesson(one, 0), lesson(two, 1),
    indexed(one, words.hond, "de hond", "de hond"), indexed(one, words.vrij, "vrij", "vrij"), indexed(two, words.vrijToo, "Vríj", "vrij"),
    // Indexed before search keys: plain ASCII falls back to its lower-cased term; anything SQLite cannot fold is skipped.
    indexed(two, words.plain, "  Het Huis ", null), indexed(two, words.uber, "Über", null),
    // Every box once for Ana in Understand, plus a Produce state and a term drilled in two lessons.
    state(ana, one, words.hond, "understand", 1, 1_000), state(ana, one, words.hond, "produce", 5, 2_000),
    state(ana, one, words.vrij, "understand", 4, 3_000), state(ana, two, words.vrijToo, "understand", 2, 4_000),
    state(ana, two, words.plain, "understand", 3, 5_000), state(ana, two, words.uber, "understand", 3, 6_000),
    // A state of a word no longer in the index is skipped.
    state(ana, two, words.gone, "understand", 5, 7_000),
    state(ben, one, words.hond, "understand", 5, 8_000),
  ]);
  return { ana, ben, courseId, one, two, words };
}

describe("Migration 0026 learning data", () => {
  it("turns each drill state into a seed review and memory rows, then drops the drill states", async () => {
    const seeded = await seedDrillStates();
    await applyD1Migrations(legacy, migrations.filter((migration) => migration.name.startsWith("0026_")));
    const { ana, ben, one, two, words } = seeded;

    const reviews = await legacy.prepare(
      `SELECT user_id AS userId, term_key AS termKey, lesson_id AS lessonId, word_id AS wordId, direction, result, source, seed_box AS seedBox,
         conversation_id AS conversationId, created_at AS createdAt, id FROM word_reviews ORDER BY created_at`,
    ).all<{ userId: string; termKey: string; lessonId: string; wordId: string; direction: string; result: string; source: string; seedBox: number; conversationId: null; createdAt: number; id: string }>();
    expect(reviews.results.map(({ id: _id, ...review }) => review)).toEqual([
      { userId: ana, termKey: "de hond", lessonId: one, wordId: words.hond, direction: "understand", result: "again", source: "seed", seedBox: 1, conversationId: null, createdAt: 1_000 },
      { userId: ana, termKey: "de hond", lessonId: one, wordId: words.hond, direction: "produce", result: "got", source: "seed", seedBox: 5, conversationId: null, createdAt: 2_000 },
      { userId: ana, termKey: "vrij", lessonId: one, wordId: words.vrij, direction: "understand", result: "got", source: "seed", seedBox: 4, conversationId: null, createdAt: 3_000 },
      { userId: ana, termKey: "vrij", lessonId: two, wordId: words.vrijToo, direction: "understand", result: "got", source: "seed", seedBox: 2, conversationId: null, createdAt: 4_000 },
      { userId: ana, termKey: "het huis", lessonId: two, wordId: words.plain, direction: "understand", result: "got", source: "seed", seedBox: 3, conversationId: null, createdAt: 5_000 },
      { userId: ben, termKey: "de hond", lessonId: one, wordId: words.hond, direction: "understand", result: "got", source: "seed", seedBox: 5, conversationId: null, createdAt: 8_000 },
    ]);
    for (const review of reviews.results) expect(review.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const memory = await legacy.prepare(
      `SELECT user_id AS userId, term_key AS termKey, direction, course_id AS courseId, lesson_id AS lessonId, word_id AS wordId, recent, reps, lapses,
         last_lapse_at AS lastLapseAt, stability, difficulty, last_reviewed_at AS lastReviewedAt, known_override AS knownOverride
       FROM word_memory ORDER BY user_id = ?, term_key, direction`,
    ).bind(ben).all<Record<string, unknown> & { userId: string; termKey: string; direction: string }>();
    const row = (userId: string, termKey: string, direction: string) => memory.results.find((entry) => entry.userId === userId && entry.termKey === termKey && entry.direction === direction);
    expect(memory.results).toHaveLength(5);
    expect(row(ana, "de hond", "understand")).toMatchObject({ lessonId: one, wordId: words.hond, recent: "a", reps: 1, lapses: 0, lastLapseAt: null, stability: 0.5, lastReviewedAt: 1_000, knownOverride: 0 });
    expect(row(ana, "de hond", "produce")).toMatchObject({ recent: "g", stability: 21 });
    expect(row(ana, "het huis", "understand")).toMatchObject({ stability: 3, lastReviewedAt: 5_000 });
    // A term drilled in two lessons is one memory, represented by its latest drill.
    expect(row(ana, "vrij", "understand")).toMatchObject({ lessonId: two, wordId: words.vrijToo, recent: "gg", reps: 2, stability: SEED_STABILITY_DAYS[2], lastReviewedAt: 4_000 });
    expect(row(ben, "de hond", "understand")).toMatchObject({ stability: 21, difficulty: WORD_DEFAULT_DIFFICULTY });

    // Every seeded row is exactly what the engine rebuilds from its seed reviews.
    for (const entry of memory.results) {
      const log = await legacy.prepare(
        `SELECT result, source, seed_box AS seedBox, course_id AS courseId, lesson_id AS lessonId, word_id AS wordId, created_at AS createdAt
         FROM word_reviews WHERE user_id = ? AND term_key = ? AND direction = ? ORDER BY created_at, id`,
      ).bind(entry.userId, entry.termKey, entry.direction).all<FoldableWordReview>();
      const { userId: _userId, termKey: _termKey, direction: _direction, knownOverride, ...stored } = entry;
      expect({ ...stored, knownOverride: knownOverride === 1 }).toEqual(rebuildWordMemory(log.results));
    }

    const dropped = await legacy.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'course_word_drill_states%'").all();
    expect(dropped.results).toEqual([]);
  });

  it("creates the learning data tables without group_id and with their checks and indexes", async () => {
    const tables = await env.DB.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN ('word_reviews', 'word_memory', 'practice_attempts', 'pronunciation_attempts', 'progress_events') ORDER BY name",
    ).all<{ name: string; sql: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(["practice_attempts", "progress_events", "pronunciation_attempts", "word_memory", "word_reviews"]);
    for (const table of tables.results) expect(table.sql, table.name).not.toContain("group_id");
    const sql = Object.fromEntries(tables.results.map((table) => [table.name, table.sql]));
    expect(sql.word_memory).toContain("PRIMARY KEY (`user_id`, `term_key`, `direction`)");
    for (const check of ["direction_check", "result_check", "source_check", "seed_box_check"]) expect(sql.word_reviews).toContain(`word_reviews_${check}`);
    for (const check of ["kind_check", "source_check", "verdict_check", "length_check"]) expect(sql.practice_attempts).toContain(`practice_attempts_${check}`);
    expect(sql.pronunciation_attempts).toContain("pronunciation_attempts_score_check");
    expect(sql.progress_events).toContain("progress_events_kind_check");
    const indexes = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      "word_reviews_term_idx", "word_reviews_user_lesson_idx", "word_reviews_lesson_idx", "word_memory_user_reviewed_idx", "practice_attempts_user_created_idx",
      "practice_attempts_user_lesson_idx", "pronunciation_attempts_user_created_idx", "pronunciation_attempts_user_term_idx", "progress_events_user_created_idx",
    ).all();
    expect(indexes.results).toHaveLength(9);
    const now = Date.now();
    const userId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'checks@example.test', 'checks@example.test', 'x', 'checks', 0, ?, ?)").bind(userId, now, now).run();
    // Checks refuse unknown enums and out-of-range scores.
    await expect(env.DB.prepare("INSERT INTO progress_events (id, user_id, actor, kind, course_id, lesson_id, conversation_id, created_at) VALUES (?, ?, 'robot', 'lesson_reset', 'c', 'l', NULL, ?)").bind(crypto.randomUUID(), userId, now).run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO pronunciation_attempts (id, user_id, surface, reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness, word_scores, created_at) VALUES (?, ?, 'drill', 'x', NULL, NULL, NULL, 101, 0, 0, 0, '[]', ?)",
    ).bind(crypto.randomUUID(), userId, now).run()).rejects.toThrow();
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
  });
});
