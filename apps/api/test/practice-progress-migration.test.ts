import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, inject, it } from "vitest";

// A separate database seeded in the shape before 0022, so the migration runs against real shared answer sets.
const legacy = (env as unknown as { MIGRATION_DB: D1Database }).MIGRATION_DB;
const migrations = inject("migrations");

async function seedAnswerSets() {
  await applyD1Migrations(legacy, migrations.filter((migration) => migration.name < "0022_"));
  const now = Date.now(); const id = () => crypto.randomUUID();
  const [ana, ben, groupId, courseId, lessonId, practiceId, postId] = [id(), id(), id(), id(), id(), id(), id()];
  const [anaFirst, anaSecond, benSet, reply, postComment] = [id(), id(), id(), id(), id()];
  const user = (userId: string, name: string) => legacy.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, must_change_password, created_at, updated_at) VALUES (?, ?, ?, 'x', ?, 0, ?, ?)")
    .bind(userId, `${name}@example.test`, `${name}@example.test`, name, now, now);
  const comment = (commentId: string, authorId: string, kind: string, parentId: string | null, updatedAt = now) =>
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)")
      .bind(commentId, groupId, practiceId, authorId, parentId, kind, kind === "text" ? "Nice" : null, now, updatedAt);
  const item = (commentId: string, position: number, answer: string) => legacy.prepare("INSERT INTO comment_response_items (comment_id, position, prompt, answer, skipped, matched) VALUES (?, ?, 'Prompt', ?, ?, NULL)")
    .bind(commentId, position, answer, answer ? 0 : 1);
  const reaction = (targetId: string) => legacy.prepare("INSERT INTO reactions (group_id, user_id, target_kind, target_id, emoji, created_at) VALUES (?, ?, 'comment', ?, '👍', ?)").bind(groupId, ben, targetId, now);
  await legacy.batch([
    user(ana, "ana"), user(ben, "ben"),
    legacy.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, 'Library', 'nl', ?, ?, ?)").bind(groupId, ana, "m".repeat(40), now, now),
    legacy.prepare("INSERT INTO courses (id, group_id, owner_id, title, summary, status, created_at, updated_at) VALUES (?, ?, ?, 'Course', 'Summary', 'published', ?, ?)").bind(courseId, groupId, ana, now, now),
    legacy.prepare("INSERT INTO course_lessons (id, group_id, course_id, title, position, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 'Lesson', 0, ?, ?, ?, ?)").bind(lessonId, groupId, courseId, ana, ana, now, now),
    legacy.prepare("INSERT INTO course_practices (id, group_id, course_id, lesson_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(practiceId, groupId, courseId, lessonId, now),
    // Ana shared two sets, answering one and then both questions; Ben shared a blank set and replied to Ana.
    comment(anaFirst, ana, "practice_response", null), item(anaFirst, 0, "Er is"), item(anaFirst, 1, ""),
    comment(anaSecond, ana, "practice_response", null, now + 5), item(anaSecond, 0, "Er is"), item(anaSecond, 1, "Er zijn"),
    comment(benSet, ben, "practice_response", null), item(benSet, 0, ""), item(benSet, 1, ""),
    comment(reply, ben, "text", anaFirst), reaction(anaFirst), reaction(reply),
    // A post discussion is untouched.
    legacy.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at) VALUES (?, ?, ?, 'question', 'Vraag?', NULL, NULL, ?, ?)").bind(postId, groupId, ana, now, now),
    legacy.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, 'text', 'Antwoord', ?, ?)").bind(postComment, groupId, postId, ben, now, now),
    reaction(postComment),
  ]);
  return { ana, ben, practiceId, postComment, now };
}

describe("Migration 0022 practice progress", () => {
  it("turns shared answer sets into progress counts and deletes the practice threads", async () => {
    const seeded = await seedAnswerSets();
    await applyD1Migrations(legacy, migrations.filter((migration) => migration.name.startsWith("0022_")));

    const progress = await legacy.prepare("SELECT practice_id AS practiceId, user_id AS userId, answered, updated_at AS updatedAt FROM course_practice_progress ORDER BY answered DESC")
      .all<{ practiceId: string; userId: string; answered: number; updatedAt: number }>();
    expect(progress.results).toEqual([
      { practiceId: seeded.practiceId, userId: seeded.ana, answered: 2, updatedAt: seeded.now + 5 },
      { practiceId: seeded.practiceId, userId: seeded.ben, answered: 0, updatedAt: seeded.now },
    ]);
    const left = await legacy.prepare(`SELECT (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM comment_response_items) AS items,
      (SELECT COUNT(*) FROM reactions) AS reactions, (SELECT id FROM comments) AS kept`).first();
    expect(left).toEqual({ comments: 1, items: 0, reactions: 1, kept: seeded.postComment });
  });
});
