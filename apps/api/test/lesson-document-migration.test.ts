import { applyD1Migrations, env } from "cloudflare:test";
import { courseBlockPayloadSchemas, type CourseBlockKind } from "@wordinator/contracts";
import { lessonDocumentSchema, upgradeLegacyBlocks, type LegacyLessonBlock } from "@wordinator/contracts/lesson-document";
import { describe, expect, inject, it } from "vitest";
import fixture from "../../../test/fixtures/courses/dutch-foundations-part-iii.json";

// A separate database seeded in the v1 shape, so 0015 runs against real legacy rows.
const legacy = (env as unknown as { MIGRATION_DB: D1Database }).MIGRATION_DB;
const migrations = inject("migrations");
const upgrade = migrations.filter((migration) => migration.name.startsWith("0015_"));

type Row = { id: string; lessonId: string; kind: CourseBlockKind; payload: string; published: boolean };

async function seedLegacy() {
  await applyD1Migrations(legacy, migrations.filter((migration) => migration.name < "0015_"));
  const userId = crypto.randomUUID(); const groupId = crypto.randomUUID(); const courseId = crypto.randomUUID(); const now = Date.now();
  const statements = [
    legacy.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, 'm@example.test', 'm@example.test', 'x', 'Migrator', 0, ?, ?)").bind(userId, now, now),
    legacy.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Group', 'nl', ?, ?, ?)").bind(groupId, userId, "m".repeat(40), now, now),
    legacy.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, 'Migrator', ?)").bind(groupId, userId, now, now, now),
    legacy.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, userId, now, now),
  ];
  const lessons: Array<{ id: string; published: boolean; rows: Row[] }> = [];
  // The fixture lessons, every other one unpublished, plus a lesson with line breaks and unpublished blocks and an empty lesson.
  const sources = [
    ...fixture.lessons.map((lesson) => lesson.blocks as Array<{ kind: CourseBlockKind; payload: unknown }>),
    [
      { kind: "text" as const, payload: { content: "Line one\nLine two\n\n“Quoted” — ü, ß, emoji 🙂, and a \"quote\"" } },
      { kind: "dialogue" as const, payload: { turns: [{ speaker: "A", text: "Hoi\nhoe gaat het?" }, { speaker: "B", text: "Goed, \"dank je\"" }] } },
      { kind: "example" as const, payload: { sentence: "Ik woon hier.", translation: null, note: null } },
    ],
    [],
  ];
  sources.forEach((blocks, lessonIndex) => {
    const lessonId = crypto.randomUUID(); const published = lessonIndex % 2 === 0;
    statements.push(legacy.prepare(
      "INSERT INTO course_lessons (id, group_id, course_id, title, goal, position, published, version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, 3, ?, ?, ?, ?)",
    ).bind(lessonId, groupId, courseId, `Lesson ${lessonIndex}`, lessonIndex, published ? 1 : 0, userId, userId, now, now + lessonIndex));
    // Positions are stored in reverse insertion order so the test proves the migration orders by position, not by row order.
    const rows = blocks.map((block, index): Row => ({
      id: crypto.randomUUID(), lessonId, kind: block.kind, published: index % 3 !== 1,
      // The API stored the parsed contract output, exactly as below.
      payload: JSON.stringify(courseBlockPayloadSchemas[block.kind].parse(block.payload)),
    }));
    [...rows].reverse().forEach((row) => {
      const position = rows.indexOf(row);
      statements.push(legacy.prepare(
        "INSERT INTO course_blocks (id, group_id, course_id, lesson_id, position, kind, payload, payload_version, published, version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?, ?, ?)",
      ).bind(row.id, groupId, courseId, lessonId, position, row.kind, row.payload, row.published ? 1 : 0, userId, userId, now, now));
    });
    lessons.push({ id: lessonId, published, rows });
  });
  // A practice answer with a reply, a reaction, and a pinned post comment that must survive the comments rebuild.
  const practice = lessons.flatMap((lesson) => lesson.rows).find((row) => row.kind === "practice")!;
  const answerId = crypto.randomUUID(); const replyId = crypto.randomUUID(); const postId = crypto.randomUUID(); const postCommentId = crypto.randomUUID();
  statements.push(
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, NULL, 'practice_response', NULL, ?, ?)").bind(answerId, groupId, practice.id, userId, now, now),
    legacy.prepare("INSERT INTO comment_response_items (comment_id, position, prompt, answer, skipped, matched) VALUES (?, 0, 'Prompt', 'Answer', 0, NULL)").bind(answerId),
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, 'text', 'Nice', ?, ?)").bind(replyId, groupId, practice.id, userId, answerId, now, now),
    legacy.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, 'question', 'Vraag?', NULL, NULL, ?, ?)").bind(postId, groupId, userId, now, now),
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, 'text', 'Antwoord', ?, ?)").bind(postCommentId, groupId, postId, userId, now, now),
    legacy.prepare("INSERT INTO post_pins (post_id, comment_id, pinned_by_user_id, created_at) VALUES (?, ?, ?, ?)").bind(postId, postCommentId, userId, now),
    legacy.prepare("INSERT INTO course_lesson_completions (group_id, course_id, lesson_id, user_id, completed_at) VALUES (?, ?, ?, ?, ?)").bind(groupId, courseId, lessons[0]!.id, userId, now),
  );
  await legacy.batch(statements);
  return { lessons, practice, answerId, replyId, postCommentId };
}

const legacyBlocks = (rows: Row[]): LegacyLessonBlock[] => rows.map((row) => ({ id: row.id, kind: row.kind, payload: JSON.parse(row.payload) }));

describe("Migration 0015 lesson documents", () => {
  it("upgrades legacy blocks into draft and published documents exactly like upgradeLegacyBlocks", async () => {
    const seeded = await seedLegacy();
    await applyD1Migrations(legacy, upgrade);

    const stored = await legacy.prepare("SELECT id, draft_doc AS draftDoc, draft_version AS draftVersion, published_doc AS publishedDoc, published_at AS publishedAt FROM course_lessons")
      .all<{ id: string; draftDoc: string; draftVersion: number; publishedDoc: string | null; publishedAt: number | null }>();
    expect(stored.results).toHaveLength(seeded.lessons.length);
    for (const lesson of seeded.lessons) {
      const row = stored.results.find((entry) => entry.id === lesson.id)!;
      const draft = lessonDocumentSchema.parse(JSON.parse(row.draftDoc));
      expect(draft).toEqual(upgradeLegacyBlocks(legacyBlocks(lesson.rows)));
      // Stored JSON strings inside props match what the contracts produce, character for character.
      expect(JSON.parse(row.draftDoc)).toEqual(JSON.parse(JSON.stringify(upgradeLegacyBlocks(legacyBlocks(lesson.rows)))));
      expect(row.draftVersion).toBe(1);
      if (lesson.published) {
        expect(lessonDocumentSchema.parse(JSON.parse(row.publishedDoc!))).toEqual(upgradeLegacyBlocks(legacyBlocks(lesson.rows.filter((entry) => entry.published))));
        expect(row.publishedAt).not.toBeNull();
      } else {
        expect(row.publishedDoc).toBeNull();
        expect(row.publishedAt).toBeNull();
      }
    }
    const fixtureDraft = JSON.parse(stored.results.find((entry) => entry.id === seeded.lessons[0]!.id)!.draftDoc);
    expect(fixtureDraft.blocks).toHaveLength(fixture.lessons[0]!.blocks.length);

    const practiceIds = seeded.lessons.flatMap((lesson) => lesson.rows).filter((row) => row.kind === "practice").map((row) => row.id).sort();
    const practices = await legacy.prepare("SELECT id FROM course_practices ORDER BY id").all<{ id: string }>();
    expect(practices.results.map((row) => row.id)).toEqual(practiceIds);

    const comments = await legacy.prepare("SELECT id, block_id AS blockId, parent_comment_id AS parentId FROM comments ORDER BY created_at, id").all<{ id: string; blockId: string | null; parentId: string | null }>();
    expect(comments.results).toHaveLength(3);
    expect(comments.results.find((row) => row.id === seeded.replyId)).toMatchObject({ blockId: seeded.practice.id, parentId: seeded.answerId });
    const counts = await legacy.prepare(`SELECT (SELECT COUNT(*) FROM comment_response_items) AS items, (SELECT COUNT(*) FROM post_pins) AS pins,
      (SELECT COUNT(*) FROM course_lesson_completions) AS completions, (SELECT COUNT(*) FROM sqlite_master WHERE name = 'course_blocks') AS blockTable`)
      .first<{ items: number; pins: number; completions: number; blockTable: number }>();
    expect(counts).toEqual({ items: 1, pins: 1, completions: 1, blockTable: 0 });
    const columns = await legacy.prepare("SELECT name FROM pragma_table_info('course_lessons')").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).not.toContain("published");
    expect(columns.results.map((column) => column.name)).not.toContain("version");
    const foreignKeys = await legacy.prepare("SELECT \"table\" AS target FROM pragma_foreign_key_list('comments') WHERE \"from\" = 'block_id'").first<{ target: string }>();
    expect(foreignKeys?.target).toBe("course_practices");
    expect((await legacy.prepare("SELECT COUNT(*) AS problems FROM pragma_foreign_key_check").first<{ problems: number }>())?.problems).toBe(0);

    // Deleting a practice anchor removes its thread, as deleting a block did before.
    await legacy.prepare("DELETE FROM course_practices WHERE id = ?").bind(seeded.practice.id).run();
    expect((await legacy.prepare("SELECT COUNT(*) AS total FROM comments WHERE block_id IS NOT NULL").first<{ total: number }>())?.total).toBe(0);
  });
});
