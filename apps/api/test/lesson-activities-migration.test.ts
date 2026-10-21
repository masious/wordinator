import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, inject, it } from "vitest";

// Migration 0036 (docs/lesson-activities.md): the shared activity cache, each learner's private runs and answers, the AI turn
// reservations, and the learning_time rebuild that admits `lesson_activity` rows. The checks, indexes, and cascades run against
// SQLite itself. The legacy database is seeded in the shape before 0036, so the rebuild runs against real learning time rows.
const legacy = (env as unknown as { MIGRATION_DB: D1Database }).MIGRATION_DB;
const migrations = inject("migrations");

const now = Date.now();
const uuid = () => crypto.randomUUID();
const DAY = "2026-10-21";
const DAY_START = Date.parse(`${DAY}T00:00:00Z`);
const sorted = (values: string[]) => [...values].sort();

type Scope = { lessonId: string; courseId: string };

function insertUser(db: D1Database, userId: string) {
  return db.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 'x', 'learner', 0, ?, ?)")
    .bind(userId, `${userId}@example.test`, `${userId}@example.test`, now, now);
}

function insertLesson(db: D1Database, lessonId: string, groupId: string, courseId: string, userId: string, position: number) {
  return db.prepare("INSERT INTO course_lessons (id, group_id, course_id, title, position, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Lesson', ?, ?, ?, ?, ?)")
    .bind(lessonId, groupId, courseId, position, userId, userId, now, now);
}

// One group, one published course with two lessons, and three accounts: the owner (who is not a learner here), and two learners.
async function seedLibrary(db: D1Database) {
  const [owner, learner, other, groupId, courseId, lessonId, otherLessonId] = [uuid(), uuid(), uuid(), uuid(), uuid(), uuid(), uuid()];
  await db.batch([
    insertUser(db, owner), insertUser(db, learner), insertUser(db, other),
    db.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Library', 'nl', ?, ?, ?)")
      .bind(groupId, owner, uuid().replace(/-/g, ""), now, now),
    db.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)")
      .bind(courseId, groupId, owner, now, now),
    insertLesson(db, lessonId, groupId, courseId, owner, 0),
    insertLesson(db, otherLessonId, groupId, courseId, owner, 1),
  ]);
  return { owner, learner, other, groupId, courseId, lessonId, otherLessonId };
}
type Library = Awaited<ReturnType<typeof seedLibrary>>;

type ActivityRow = {
  id: string; cacheKey: string; status: string; activityType: string; language: string;
  leaseToken: string | null; leaseExpiresAt: number | null; payload: string | null;
};
// Defaults to a ready row with a payload; tests override the fields they check.
function insertActivity(db: D1Database, scope: Scope, row: Partial<ActivityRow> = {}) {
  const full: ActivityRow = {
    id: uuid(), cacheKey: uuid(), status: "ready", activityType: "story_summary", language: "nl",
    leaseToken: null, leaseExpiresAt: null, payload: '{"items":[]}', ...row,
  };
  return db.prepare(
    `INSERT INTO lesson_activities (id, lesson_id, course_id, source_id, activity_type, source_fingerprint, recipe_version, schema_version, language, cache_key, status, lease_token, lease_expires_at, next_attempt_at, payload, created_at, updated_at)
     VALUES (?, ?, ?, 'source-1', ?, 'fingerprint-1', 1, 1, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).bind(full.id, scope.lessonId, scope.courseId, full.activityType, full.language, full.cacheKey, full.status, full.leaseToken, full.leaseExpiresAt, full.payload, now, now);
}

type RunRow = { id: string; cursor: number; cueMode: string; status: string; completedAt: number | null };
function insertRun(db: D1Database, activityId: string, userId: string, row: Partial<RunRow> = {}) {
  const full: RunRow = { id: uuid(), cursor: 0, cueMode: "english", status: "active", completedAt: null, ...row };
  return db.prepare(
    "INSERT INTO lesson_activity_runs (id, activity_id, user_id, cursor, cue_mode, status, started_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(full.id, activityId, userId, full.cursor, full.cueMode, full.status, now, now, full.completedAt);
}

type AnswerRow = { id: string; idempotencyKey: string; inputMode: string; correct: number; matched: number };
function insertAnswer(db: D1Database, runId: string, row: Partial<AnswerRow> = {}) {
  const full: AnswerRow = { id: uuid(), idempotencyKey: uuid(), inputMode: "typed", correct: 1, matched: 1, ...row };
  return db.prepare(
    "INSERT INTO lesson_activity_answers (id, run_id, item_id, idempotency_key, answer, input_mode, correct, matched, reference, pronunciation_json, created_at) VALUES (?, ?, 'item-1', ?, 'huis', ?, ?, ?, NULL, NULL, ?)",
  ).bind(full.id, runId, full.idempotencyKey, full.inputMode, full.correct, full.matched, now);
}

function insertReservation(db: D1Database, userId: string, row: { id?: string; cacheKey?: string; dayStart?: number } = {}) {
  return db.prepare("INSERT INTO ai_turn_reservations (id, user_id, cache_key, day_start, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(row.id ?? uuid(), userId, row.cacheKey ?? uuid(), row.dayStart ?? DAY_START, now + 60_000);
}

type LearningTimeRow = {
  entryKey: string; activity: string; focus: string | null; courseId: string | null; lessonId: string | null; practiceId: string | null; seconds: number; day?: string;
};
function insertLearningTime(db: D1Database, userId: string, row: LearningTimeRow) {
  return db.prepare(
    "INSERT INTO learning_time (user_id, entry_key, day, activity, focus, course_id, lesson_id, practice_id, seconds, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(userId, row.entryKey, row.day ?? DAY, row.activity, row.focus, row.courseId, row.lessonId, row.practiceId, row.seconds, now);
}

// The ids among `ids` that still exist in `table`.
async function existing(table: string, ids: string[]) {
  const marks = ids.map(() => "?").join(", ");
  const result = await env.DB.prepare(`SELECT id FROM ${table} WHERE id IN (${marks})`).bind(...ids).all<{ id: string }>();
  return sorted(result.results.map((row) => row.id));
}

describe("Migration 0036 learning time rebuild", () => {
  it("keeps every existing learning time row and its cascades, then admits lesson_activity rows", async () => {
    await applyD1Migrations(legacy, migrations.filter((migration) => migration.name < "0036_"));
    const lib = await seedLibrary(legacy);
    const practiceId = uuid();
    // One row of each activity the 0034 check allowed, so the rebuild has to copy every shape.
    const entries: LearningTimeRow[] = [
      { entryKey: "reading-lesson", activity: "reading", focus: "lesson", courseId: lib.courseId, lessonId: lib.lessonId, practiceId: null, seconds: 60 },
      { entryKey: "reading-grammar", activity: "reading", focus: "grammar", courseId: lib.courseId, lessonId: lib.lessonId, practiceId: null, seconds: 30 },
      { entryKey: "practice", activity: "practice", focus: null, courseId: lib.courseId, lessonId: lib.lessonId, practiceId, seconds: 45 },
      { entryKey: "ai-practice", activity: "ai_practice", focus: "vocabulary", courseId: lib.courseId, lessonId: lib.lessonId, practiceId: uuid(), seconds: 90 },
      { entryKey: "drill", activity: "drill", focus: null, courseId: null, lessonId: null, practiceId: null, seconds: 120 },
      { entryKey: "tutor", activity: "tutor", focus: null, courseId: null, lessonId: null, practiceId: null, seconds: 200 },
      { entryKey: "words", activity: "words", focus: null, courseId: null, lessonId: null, practiceId: null, seconds: 15 },
    ];
    await legacy.batch(entries.map((entry) => insertLearningTime(legacy, lib.learner, entry)));

    await applyD1Migrations(legacy, migrations.filter((migration) => migration.name.startsWith("0036_")));

    const kept = await legacy.prepare(
      "SELECT entry_key AS entryKey, activity, focus, course_id AS courseId, lesson_id AS lessonId, practice_id AS practiceId, seconds, day, updated_at AS updatedAt FROM learning_time WHERE user_id = ? ORDER BY entry_key",
    ).bind(lib.learner).all();
    const expected = entries
      .map((entry) => ({ entryKey: entry.entryKey, activity: entry.activity, focus: entry.focus, courseId: entry.courseId, lessonId: entry.lessonId, practiceId: entry.practiceId, seconds: entry.seconds, day: DAY, updatedAt: now }))
      .sort((a, b) => (a.entryKey < b.entryKey ? -1 : 1));
    expect(kept.results).toEqual(expected);
    expect(await legacy.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE name = 'learning_time_old'").first("total")).toBe(0);

    // The rebuilt table takes lesson_activity rows with a focus, a course, a lesson, and a practice; nothing else.
    for (const focus of ["reading", "grammar", "speaking"]) {
      await insertLearningTime(legacy, lib.learner, { entryKey: `activity-${focus}`, activity: "lesson_activity", focus, courseId: lib.courseId, lessonId: lib.lessonId, practiceId: uuid(), seconds: 30 }).run();
    }
    await expect(insertLearningTime(legacy, lib.learner, { entryKey: "activity-writing", activity: "lesson_activity", focus: "writing", courseId: lib.courseId, lessonId: lib.lessonId, practiceId: uuid(), seconds: 30 }).run()).rejects.toThrow(/CHECK/);
    await expect(insertLearningTime(legacy, lib.learner, { entryKey: "activity-no-focus", activity: "lesson_activity", focus: null, courseId: lib.courseId, lessonId: lib.lessonId, practiceId: uuid(), seconds: 30 }).run()).rejects.toThrow(/CHECK/);
    await expect(insertLearningTime(legacy, lib.learner, { entryKey: "activity-no-practice", activity: "lesson_activity", focus: "speaking", courseId: lib.courseId, lessonId: lib.lessonId, practiceId: null, seconds: 30 }).run()).rejects.toThrow(/CHECK/);
    await expect(insertLearningTime(legacy, lib.learner, { entryKey: "activity-no-lesson", activity: "lesson_activity", focus: "speaking", courseId: lib.courseId, lessonId: null, practiceId: uuid(), seconds: 30 }).run()).rejects.toThrow(/CHECK/);

    // The lesson foreign key still cascades from the rebuilt table: the lesson's rows go, the course-free rows stay.
    await legacy.prepare("DELETE FROM course_lessons WHERE id = ?").bind(lib.lessonId).run();
    const remaining = await legacy.prepare("SELECT entry_key AS entryKey FROM learning_time WHERE user_id = ? ORDER BY entry_key").bind(lib.learner).all<{ entryKey: string }>();
    expect(remaining.results.map((row) => row.entryKey)).toEqual(["drill", "tutor", "words"]);
  });
});

describe("Migration 0036 tables", () => {
  it("creates the four tables with the columns and defaults the code relies on", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('lesson_activities', 'lesson_activity_runs', 'lesson_activity_answers', 'ai_turn_reservations') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((table) => table.name)).toEqual(["ai_turn_reservations", "lesson_activities", "lesson_activity_answers", "lesson_activity_runs"]);

    const columns = async (table: string) => (await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string; dflt_value: string | null }>()).results;
    expect((await columns("lesson_activities")).map((column) => column.name)).toEqual([
      "id", "lesson_id", "course_id", "source_id", "activity_type", "source_fingerprint", "recipe_version", "schema_version", "language", "cache_key",
      "status", "lease_token", "lease_expires_at", "next_attempt_at", "payload", "created_at", "updated_at",
    ]);
    const runs = await columns("lesson_activity_runs");
    expect(runs.map((column) => column.name)).toEqual(["id", "activity_id", "user_id", "cursor", "cue_mode", "status", "started_at", "updated_at", "completed_at", "metrics_before"]);
    expect(Object.fromEntries(runs.filter((column) => column.dflt_value !== null).map((column) => [column.name, column.dflt_value]))).toEqual({
      cursor: "0", cue_mode: "'english'", status: "'active'",
    });
    expect((await columns("lesson_activity_answers")).map((column) => column.name)).toEqual([
      "id", "run_id", "item_id", "idempotency_key", "answer", "input_mode", "correct", "matched", "reference", "pronunciation_json", "created_at",
    ]);
    expect((await columns("ai_turn_reservations")).map((column) => column.name)).toEqual(["id", "user_id", "cache_key", "day_start", "expires_at"]);
  });

  it("creates the indexes, with the unique ones enforcing the keys", async () => {
    const indexes = await env.DB.prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%'
         AND tbl_name IN ('lesson_activities', 'lesson_activity_runs', 'lesson_activity_answers', 'ai_turn_reservations', 'learning_time') ORDER BY name`,
    ).all<{ name: string; sql: string }>();
    const unique = ["ai_turn_reservations_user_cache_day_unique", "lesson_activities_cache_key_unique", "lesson_activity_answers_run_idempotency_unique", "lesson_activity_runs_activity_user_unique"];
    const plain = ["ai_turn_reservations_user_day_expiry_idx", "lesson_activities_lesson_idx", "lesson_activity_answers_run_item_idx", "lesson_activity_runs_user_idx", "learning_time_lesson_idx", "learning_time_user_day_idx", "learning_time_user_updated_idx"];
    expect(sorted(indexes.results.filter((index) => index.sql.startsWith("CREATE UNIQUE")).map((index) => index.name))).toEqual(unique);
    expect(sorted(indexes.results.filter((index) => !index.sql.startsWith("CREATE UNIQUE")).map((index) => index.name))).toEqual(sorted(plain));
  });
});

describe("lesson activity cache rows", () => {
  it("keeps one row per cache key", async () => {
    const lib = await seedLibrary(env.DB);
    const cacheKey = uuid();
    await insertActivity(env.DB, lib, { cacheKey }).run();
    await expect(insertActivity(env.DB, lib, { cacheKey }).run()).rejects.toThrow(/UNIQUE/);
    await insertActivity(env.DB, lib, {}).run();
  });

  it("allows only the generating, ready, and failed statuses", async () => {
    const lib = await seedLibrary(env.DB);
    // A bad status with no payload and no lease violates only the status check.
    await expect(insertActivity(env.DB, lib, { status: "queued", payload: null }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "done", payload: null }).run()).rejects.toThrow(/CHECK/);
    await insertActivity(env.DB, lib, { status: "failed", payload: null }).run();
  });

  it("pairs generating with a lease token and expiry", async () => {
    const lib = await seedLibrary(env.DB);
    const lease = { leaseToken: "lease-a", leaseExpiresAt: now + 60_000, payload: null };
    await expect(insertActivity(env.DB, lib, { status: "generating", ...lease, leaseToken: null }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "generating", ...lease, leaseExpiresAt: null }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "generating", payload: null }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "ready", ...lease, payload: '{"items":[]}' }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "failed", ...lease }).run()).rejects.toThrow(/CHECK/);
    await insertActivity(env.DB, lib, { status: "generating", ...lease }).run();
    // A failed or ready row without a lease is fine.
    await insertActivity(env.DB, lib, { status: "failed", payload: null }).run();
  });

  it("pairs ready with a payload", async () => {
    const lib = await seedLibrary(env.DB);
    await expect(insertActivity(env.DB, lib, { status: "ready", payload: null }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "generating", leaseToken: "lease-b", leaseExpiresAt: now + 60_000, payload: '{"items":[]}' }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { status: "failed", payload: '{"items":[]}' }).run()).rejects.toThrow(/CHECK/);
    await insertActivity(env.DB, lib, { status: "ready", payload: '{"items":[]}' }).run();
  });

  it("limits the activity type and language to the shipped values", async () => {
    const lib = await seedLibrary(env.DB);
    await expect(insertActivity(env.DB, lib, { activityType: "quiz" }).run()).rejects.toThrow(/CHECK/);
    await expect(insertActivity(env.DB, lib, { language: "fr" }).run()).rejects.toThrow(/CHECK/);
    await insertActivity(env.DB, lib, { activityType: "roleplay", language: "de" }).run();
  });
});

describe("runs, answers, and reservations", () => {
  it("allows one run per learner and activity", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid();
    await insertActivity(env.DB, lib, { id: activityId }).run();
    await insertRun(env.DB, activityId, lib.learner).run();
    await expect(insertRun(env.DB, activityId, lib.learner).run()).rejects.toThrow(/UNIQUE/);
    await insertRun(env.DB, activityId, lib.other).run();
  });

  it("allows one answer per idempotency key within a run", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid(); const runId = uuid(); const otherRunId = uuid(); const key = uuid();
    await insertActivity(env.DB, lib, { id: activityId }).run();
    await insertRun(env.DB, activityId, lib.learner, { id: runId }).run();
    await insertRun(env.DB, activityId, lib.other, { id: otherRunId }).run();
    await insertAnswer(env.DB, runId, { idempotencyKey: key }).run();
    await expect(insertAnswer(env.DB, runId, { idempotencyKey: key }).run()).rejects.toThrow(/UNIQUE/);
    // The same key in another learner's run is a different answer.
    await insertAnswer(env.DB, otherRunId, { idempotencyKey: key }).run();
  });

  it("checks run values: cue mode, status, completion pairing, and cursor", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid();
    await insertActivity(env.DB, lib, { id: activityId }).run();
    await expect(insertRun(env.DB, activityId, lib.learner, { cueMode: "german" }).run()).rejects.toThrow(/CHECK/);
    await expect(insertRun(env.DB, activityId, lib.learner, { status: "paused" }).run()).rejects.toThrow(/CHECK/);
    await expect(insertRun(env.DB, activityId, lib.learner, { status: "completed", completedAt: null }).run()).rejects.toThrow(/CHECK/);
    await expect(insertRun(env.DB, activityId, lib.learner, { status: "active", completedAt: now }).run()).rejects.toThrow(/CHECK/);
    await expect(insertRun(env.DB, activityId, lib.learner, { cursor: -1 }).run()).rejects.toThrow(/CHECK/);
    await insertRun(env.DB, activityId, lib.learner, { cueMode: "dutch", status: "completed", completedAt: now }).run();
  });

  it("checks answer values: input mode and boolean flags", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid(); const runId = uuid();
    await insertActivity(env.DB, lib, { id: activityId }).run();
    await insertRun(env.DB, activityId, lib.learner, { id: runId }).run();
    await expect(insertAnswer(env.DB, runId, { inputMode: "voice" }).run()).rejects.toThrow(/CHECK/);
    await expect(insertAnswer(env.DB, runId, { correct: 2 }).run()).rejects.toThrow(/CHECK/);
    await expect(insertAnswer(env.DB, runId, { matched: 2 }).run()).rejects.toThrow(/CHECK/);
    await insertAnswer(env.DB, runId, { inputMode: "spoken", correct: 0, matched: 0 }).run();
  });

  it("allows one reservation per learner, cache key, and day", async () => {
    const lib = await seedLibrary(env.DB);
    const cacheKey = uuid();
    await insertReservation(env.DB, lib.learner, { cacheKey }).run();
    await expect(insertReservation(env.DB, lib.learner, { cacheKey }).run()).rejects.toThrow(/UNIQUE/);
    await insertReservation(env.DB, lib.learner, { cacheKey, dayStart: DAY_START + 86_400_000 }).run();
    await insertReservation(env.DB, lib.other, { cacheKey }).run();
  });
});

describe("cascades", () => {
  it("enforces the foreign keys the cascades below depend on", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid();
    await insertActivity(env.DB, lib, { id: activityId }).run();
    await expect(insertActivity(env.DB, { lessonId: uuid(), courseId: lib.courseId }).run()).rejects.toThrow(/FOREIGN KEY/);
    await expect(insertRun(env.DB, uuid(), lib.learner).run()).rejects.toThrow(/FOREIGN KEY/);
    await expect(insertRun(env.DB, activityId, uuid()).run()).rejects.toThrow(/FOREIGN KEY/);
    await expect(insertAnswer(env.DB, uuid()).run()).rejects.toThrow(/FOREIGN KEY/);
    await expect(insertReservation(env.DB, uuid()).run()).rejects.toThrow(/FOREIGN KEY/);
  });

  it("deleting a lesson removes its activities, their runs, and their answers, and keeps other lessons", async () => {
    const lib = await seedLibrary(env.DB);
    const [doomed, kept] = [uuid(), uuid()];
    const [doomedRun, doomedOtherRun, keptRun] = [uuid(), uuid(), uuid()];
    const [doomedAnswer, doomedOtherAnswer, keptAnswer] = [uuid(), uuid(), uuid()];
    await insertActivity(env.DB, { lessonId: lib.lessonId, courseId: lib.courseId }, { id: doomed }).run();
    await insertActivity(env.DB, { lessonId: lib.otherLessonId, courseId: lib.courseId }, { id: kept }).run();
    await insertRun(env.DB, doomed, lib.learner, { id: doomedRun }).run();
    await insertRun(env.DB, doomed, lib.other, { id: doomedOtherRun }).run();
    await insertRun(env.DB, kept, lib.learner, { id: keptRun }).run();
    await insertAnswer(env.DB, doomedRun, { id: doomedAnswer }).run();
    await insertAnswer(env.DB, doomedOtherRun, { id: doomedOtherAnswer }).run();
    await insertAnswer(env.DB, keptRun, { id: keptAnswer }).run();

    await env.DB.prepare("DELETE FROM course_lessons WHERE id = ?").bind(lib.lessonId).run();

    expect(await existing("lesson_activities", [doomed, kept])).toEqual([kept]);
    expect(await existing("lesson_activity_runs", [doomedRun, doomedOtherRun, keptRun])).toEqual([keptRun]);
    expect(await existing("lesson_activity_answers", [doomedAnswer, doomedOtherAnswer, keptAnswer])).toEqual([keptAnswer]);
  });

  it("deleting a learner removes their runs, answers, and reservations, but not the shared activity", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid();
    const [learnerRun, otherRun] = [uuid(), uuid()];
    const [learnerAnswer, otherAnswer] = [uuid(), uuid()];
    const reservationId = uuid();
    await insertActivity(env.DB, lib, { id: activityId }).run();
    await insertRun(env.DB, activityId, lib.learner, { id: learnerRun }).run();
    await insertRun(env.DB, activityId, lib.other, { id: otherRun }).run();
    await insertAnswer(env.DB, learnerRun, { id: learnerAnswer }).run();
    await insertAnswer(env.DB, otherRun, { id: otherAnswer }).run();
    await insertReservation(env.DB, lib.learner, { id: reservationId }).run();

    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(lib.learner).run();

    expect(await existing("lesson_activities", [activityId])).toEqual([activityId]);
    expect(await existing("lesson_activity_runs", [learnerRun, otherRun])).toEqual([otherRun]);
    expect(await existing("lesson_activity_answers", [learnerAnswer, otherAnswer])).toEqual([otherAnswer]);
    expect(await existing("ai_turn_reservations", [reservationId])).toEqual([]);
  });
});

describe("learning_time rows for lesson activities", () => {
  it("admits lesson_activity rows only with a speaking-skill focus, a course, a lesson, and a practice", async () => {
    const lib = await seedLibrary(env.DB);
    const practiceId = uuid();
    const row = (entryKey: string, overrides: Partial<LearningTimeRow> = {}) => insertLearningTime(env.DB, lib.learner, {
      entryKey, activity: "lesson_activity", focus: "speaking", courseId: lib.courseId, lessonId: lib.lessonId, practiceId, seconds: 30, ...overrides,
    });
    for (const focus of ["reading", "grammar", "speaking"]) await row(`ok-${focus}`, { focus }).run();
    await expect(row("bad-focus", { focus: "writing" }).run()).rejects.toThrow(/CHECK/);
    await expect(row("no-focus", { focus: null }).run()).rejects.toThrow(/CHECK/);
    await expect(row("no-practice", { practiceId: null }).run()).rejects.toThrow(/CHECK/);
    await expect(row("no-lesson", { lessonId: null }).run()).rejects.toThrow(/CHECK/);
    await expect(row("no-course", { courseId: null }).run()).rejects.toThrow(/CHECK/);
    await expect(row("bad-day", { day: "2026-1-1" }).run()).rejects.toThrow(/CHECK/);
    await expect(row("ok-speaking").run()).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
  });
});

// Migration 0038 (docs/lesson-activities.md): the three activity tables are recreated with the v2 type list, and runs gain a nullable
// metrics snapshot. The tables are empty after the rebuild, so each case inserts its own rows.
describe("Migration 0038 lesson activity v2", () => {
  it("keeps the three tables with their indexes and foreign keys", async () => {
    const foreignKeys = async (table: string) => (await env.DB.prepare(`PRAGMA foreign_key_list(${table})`).all<{ from: string; table: string; to: string; on_delete: string }>())
      .results.map((fk) => `${fk.from}->${fk.table}.${fk.to} ON DELETE ${fk.on_delete}`).sort();
    expect(await foreignKeys("lesson_activities")).toEqual(["course_id->courses.id ON DELETE CASCADE", "lesson_id->course_lessons.id ON DELETE CASCADE"]);
    expect(await foreignKeys("lesson_activity_runs")).toEqual(["activity_id->lesson_activities.id ON DELETE CASCADE", "user_id->users.id ON DELETE CASCADE"]);
    expect(await foreignKeys("lesson_activity_answers")).toEqual(["run_id->lesson_activity_runs.id ON DELETE CASCADE"]);

    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%' AND tbl_name IN ('lesson_activities', 'lesson_activity_runs', 'lesson_activity_answers') ORDER BY name",
    ).all<{ name: string }>();
    expect(indexes.results.map((index) => index.name)).toEqual(sorted([
      "lesson_activities_cache_key_unique", "lesson_activities_lesson_idx",
      "lesson_activity_runs_activity_user_unique", "lesson_activity_runs_user_idx",
      "lesson_activity_answers_run_idempotency_unique", "lesson_activity_answers_run_item_idx",
    ]));
  });

  it("rejects the retired quick_grammar type and admits the nine v2 types", async () => {
    const lib = await seedLibrary(env.DB);
    await expect(insertActivity(env.DB, lib, { activityType: "quick_grammar" }).run()).rejects.toThrow(/CHECK/);
    for (const activityType of ["story_summary", "story_comprehension", "grammar_explanation", "tricky_grammar", "mixed_practice", "roleplay", "guided_grammar", "read_aloud", "speak_from_english"]) {
      await insertActivity(env.DB, lib, { activityType }).run();
    }
  });

  it("adds a nullable metrics_before text column to runs", async () => {
    const lib = await seedLibrary(env.DB);
    const activityId = uuid(); const runId = uuid();
    const column = (await env.DB.prepare("PRAGMA table_info(lesson_activity_runs)").all<{ name: string; type: string; notnull: number; dflt_value: string | null }>())
      .results.find((info) => info.name === "metrics_before");
    expect(column).toMatchObject({ type: "TEXT", notnull: 0, dflt_value: null });

    await insertActivity(env.DB, lib, { id: activityId }).run();
    await insertRun(env.DB, activityId, lib.learner, { id: runId }).run();
    expect(await env.DB.prepare("SELECT metrics_before AS metricsBefore FROM lesson_activity_runs WHERE id = ?").bind(runId).first<{ metricsBefore: string | null }>())
      .toEqual({ metricsBefore: null });
  });
});
