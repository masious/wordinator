import { applyD1Migrations, env } from "cloudflare:test";
import { lessonShareKey } from "@wordinator/contracts";
import { describe, expect, inject, it } from "vitest";

// A separate database seeded in the shape before 0024, so the posts rebuild runs against real post children.
const legacy = (env as unknown as { MIGRATION_DB: D1Database }).MIGRATION_DB;
const migrations = inject("migrations");

async function seedPosts() {
  await applyD1Migrations(legacy, migrations.filter((migration) => migration.name < "0024_"));
  const now = Date.now(); const id = () => crypto.randomUUID();
  const [ana, ben, groupId, courseId, lessonId, reading, fill, coursePost, answer, reply, questionId] = [id(), id(), id(), id(), id(), id(), id(), id(), id(), id(), id()];
  const user = (userId: string, name: string) => legacy.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 'x', ?, 0, ?, ?)")
    .bind(userId, `${name}@example.test`, `${name}@example.test`, name, now, now);
  const post = (postId: string, type: string, course: string | null = null) => legacy.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Notes', ?, ?, ?)")
    .bind(postId, groupId, ana, type, type === "fill_in" ? "Er … een balkon." : "Body", course, now, now);
  await legacy.batch([
    user(ana, "ana"), user(ben, "ben"),
    legacy.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Library', 'nl', ?, ?, ?)").bind(groupId, ana, "m".repeat(40), now, now),
    legacy.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, ana, now, now),
    legacy.prepare("INSERT INTO course_lessons (id, group_id, course_id, title, position, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Lesson', 0, ?, ?, ?, ?)").bind(lessonId, groupId, courseId, ana, ana, now, now),
    post(reading, "reading"), post(fill, "fill_in"), post(coursePost, "course", courseId),
    legacy.prepare("INSERT INTO reading_questions (id, post_id, position, text) VALUES (?, ?, 0, 'Waarom?')").bind(questionId, reading),
    legacy.prepare("INSERT INTO fill_expected_answers (post_id, position, text) VALUES (?, 0, 'is')").bind(fill),
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, 'reading_response', NULL, ?, ?)").bind(answer, groupId, reading, ben, now, now),
    legacy.prepare("INSERT INTO comment_response_items (comment_id, position, prompt, answer, skipped, matched) VALUES (?, 0, 'Waarom?', 'Daarom', 0, NULL)").bind(answer),
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, 'text', 'Mooi', ?, ?)").bind(reply, groupId, reading, ana, answer, now, now),
    legacy.prepare("INSERT INTO post_pins (post_id, comment_id, pinned_by_user_id, created_at) VALUES (?, ?, ?, ?)").bind(reading, answer, ana, now),
  ]);
  return { ana, ben, groupId, courseId, lessonId, reading, fill, coursePost, answer, reply, questionId, now };
}

const count = async (table: string) => (await legacy.prepare(`SELECT COUNT(*) AS total FROM ${table}`).first<{ total: number }>())!.total;

describe("Migration 0024 lesson shares", () => {
  it("keeps every post and its children, allows lesson shares, and enforces one share per person and piece", async () => {
    const seeded = await seedPosts();
    await applyD1Migrations(legacy, migrations.filter((migration) => migration.name.startsWith("0024_")));

    expect(await legacy.prepare("SELECT id, type, course_id AS courseId FROM posts ORDER BY type").all()).toMatchObject({ results: [
      { id: seeded.coursePost, type: "course", courseId: seeded.courseId },
      { id: seeded.fill, type: "fill_in", courseId: null },
      { id: seeded.reading, type: "reading", courseId: null },
    ] });
    expect(await legacy.prepare("SELECT id FROM reading_questions").first("id")).toBe(seeded.questionId);
    expect(await legacy.prepare("SELECT text FROM fill_expected_answers").first("text")).toBe("is");
    expect((await legacy.prepare("SELECT id FROM comments ORDER BY kind").all<{ id: string }>()).results.map((row) => row.id)).toEqual([seeded.answer, seeded.reply]);
    expect(await legacy.prepare("SELECT answer FROM comment_response_items").first("answer")).toBe("Daarom");
    expect(await legacy.prepare("SELECT comment_id AS commentId FROM post_pins").first("commentId")).toBe(seeded.answer);
    for (const backup of ["reading_questions_backup", "fill_expected_answers_backup", "comments_backup", "comment_response_items_backup", "post_pins_backup"]) {
      expect(await legacy.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE name = ?").bind(backup).first("total")).toBe(0);
    }

    const blockId = crypto.randomUUID();
    const sharePost = (postId: string, authorId = seeded.ben) => legacy.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, 'lesson_share', '', NULL, NULL, ?, ?)")
      .bind(postId, seeded.groupId, authorId, seeded.now, seeded.now);
    const share = (postId: string, kind: string, shareKey: string, itemIndex: number | null, snapshot: string | null, authorId = seeded.ben) => legacy.prepare(
      `INSERT INTO post_lesson_shares (post_id, group_id, author_id, kind, course_id, lesson_id, block_id, item_index, share_key, snapshot, course_title, lesson_title, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Course', 'Lesson', ?)`,
    ).bind(postId, seeded.groupId, authorId, kind, seeded.courseId, seeded.lessonId, blockId, itemIndex, shareKey, snapshot, seeded.now);
    const [dialogue, question, again, broken] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const questionKey = lessonShareKey({ blockId, prompt: "Er … een balkon." });
    await legacy.batch([
      sharePost(dialogue), share(dialogue, "dialogue", lessonShareKey({ blockId }), null, null),
      sharePost(question), share(question, "question", questionKey, 0, JSON.stringify({ instruction: "Vul in.", prompt: "Er … een balkon.", authorsVersion: ["is"], itemIndex: 0 })),
    ]);
    expect(await count("post_lesson_shares")).toBe(2);

    // One share per person and piece; another person may share the same piece.
    await legacy.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, 'lesson_share', '', NULL, NULL, ?, ?)").bind(again, seeded.groupId, seeded.ben, seeded.now, seeded.now).run();
    await expect(share(again, "question", questionKey, 3, "{}").run()).rejects.toThrow(/UNIQUE/);
    await expect(share(again, "question", questionKey, 3, "{}", seeded.ana).run()).resolves.toBeTruthy();

    // Kind, item index, and snapshot must agree.
    await sharePost(broken).run();
    await expect(share(broken, "paragraph", "a", null, "{}").run()).rejects.toThrow(/CHECK/);
    await expect(share(broken, "question", "b", null, "{}").run()).rejects.toThrow(/CHECK/);
    await expect(share(broken, "example", "c", null, null).run()).rejects.toThrow(/CHECK/);
    await expect(share(broken, "dialogue", "d", null, "{}").run()).rejects.toThrow(/CHECK/);
    await expect(share(broken, "example", "e", null, "not json").run()).rejects.toThrow(/CHECK/);
    await expect(legacy.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, 'poll', '', NULL, NULL, ?, ?)")
      .bind(crypto.randomUUID(), seeded.groupId, seeded.ben, seeded.now, seeded.now).run()).rejects.toThrow(/CHECK/);

    // Deleting a post frees its share key.
    await legacy.prepare("DELETE FROM posts WHERE id = ?").bind(question).run();
    expect(await count("post_lesson_shares")).toBe(2);
    const reshared = crypto.randomUUID();
    await legacy.batch([sharePost(reshared), share(reshared, "question", questionKey, 1, "{}")]);
    expect(await legacy.prepare("SELECT post_id AS postId FROM post_lesson_shares WHERE author_id = ? AND share_key = ?").bind(seeded.ben, questionKey).first("postId")).toBe(reshared);

    // Deleting the lesson keeps the shares without their lesson.
    await legacy.prepare("DELETE FROM course_lessons WHERE id = ?").bind(seeded.lessonId).run();
    expect(await legacy.prepare("SELECT COUNT(*) AS total FROM post_lesson_shares WHERE lesson_id IS NULL").first("total")).toBe(3);
  });
});
