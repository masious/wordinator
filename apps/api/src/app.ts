import {
  accountSettingsResponseSchema,
  changePasswordRequestSchema,
  commentResponseSchema,
  coursePageSchema,
  courseResponseSchema,
  courseVisibilityRequestSchema,
  createCommentRequestSchema,
  createCourseRequestSchema,
  createPostRequestSchema,
  feedQuerySchema,
  createGroupRequestSchema,
  healthResponseSchema,
  imageResponseSchema,
  memberDirectoryResponseSchema,
  membershipAdminResponseSchema,
  memberLifecycleRequestSchema,
  membershipDecisionRequestSchema,
  notificationPageSchema,
  profileResponseSchema,
  postPageSchema,
  postResponseSchema,
  discussionResponseSchema,
  pinRequestSchema,
  reactionTargetResponseSchema,
  restrictedNotificationPageSchema,
  registerRequestSchema,
  renameGroupRequestSchema,
  signInRequestSchema,
  toggleReactionRequestSchema,
  temporaryPasswordResponseSchema,
  updateAccountSettingsRequestSchema,
  updatePostRequestSchema,
  updateCommentRequestSchema,
  updateCourseRequestSchema,
  paginationQuerySchema,
  blockResponseSchema,
  COURSE_BLOCK_PAYLOAD_VERSION,
  COURSE_BLOCKS_MAX,
  COURSE_LESSONS_MAX,
  COURSE_PRELOADED_LESSONS,
  courseDetailResponseSchema,
  courseProgressResponseSchema,
  createBlockRequestSchema,
  createLessonRequestSchema,
  lessonResponseSchema,
  outlineResponseSchema,
  parseStoredBlockPayload,
  reorderRequestSchema,
  updateBlockRequestSchema,
  updateLessonRequestSchema,
  createPracticeCommentRequestSchema,
  practiceDiscussionResponseSchema,
  splitPracticePayload,
  updatePracticeCommentRequestSchema,
  contributorDecisionRequestSchema,
  courseContributorsResponseSchema,
  type Course,
  type CourseBlock,
  type CourseLesson,
  type CourseLessonSummary,
  type DiscussionItem,
  type Notification,
  type Post,
  type PostInput,
} from "@wordinator/contracts";
import { createDatabase, groups, memberships, users } from "@wordinator/db";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { requestId } from "hono/request-id";
import { routePath } from "hono/route";
import { clearSession, hashPassword, newInvitationToken, readSession, setSession, sha256, type AuthUser, verifyPassword } from "./auth";
import { apiError, parseJson } from "./http";
import { logError, logInfo } from "./logger";

export type Bindings = Env & { MEDIA: R2Bucket; PUBLIC_MEDIA_BASE_URL: string };
type GroupAccess = { id: string; name: string; language: "nl" | "de"; creatorUserId: string; invitationToken: string; iconKey: string | null };
type AppEnvironment = { Bindings: Bindings; Variables: { user: AuthUser | null; groupAccess: GroupAccess } };

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 5;
const FALLBACK_HASH = "pbkdf2_sha256$40000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const IMAGE_MAX_BYTES = 1_048_576;

const mediaUrlFromBase = (base: string, key: string | null) => key
  ? `${base.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`
  : null;
const mediaUrl = (bindings: Bindings, key: string | null) => mediaUrlFromBase(bindings.PUBLIC_MEDIA_BASE_URL, key);

function imageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const chunk = new TextDecoder("latin1").decode(bytes.slice(offset + 4, offset + 8));
      if (chunk === "acTL") return null;
      if (length > bytes.length - offset - 12) break;
      offset += length + 12;
    }
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 21 && new TextDecoder("latin1").decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder("latin1").decode(bytes.slice(8, 12)) === "WEBP") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const chunk = new TextDecoder("latin1").decode(bytes.slice(offset, offset + 4));
      const length = view.getUint32(offset + 4, true);
      if (chunk === "ANIM" || chunk === "ANMF" || (chunk === "VP8X" && offset + 8 < bytes.length && Boolean(bytes[offset + 8]! & 0x02))) return null;
      if (length > bytes.length - offset - 8) break;
      offset += 8 + length + (length % 2);
    }
    return "image/webp";
  }
  return null;
}

async function uploadedImage(context: Context<AppEnvironment>, prefix: "avatars" | "groups" | "courses") {
  const form = await context.req.formData();
  const value = form.get("image");
  if (!(value instanceof File)) return { error: apiError(context, 400, "IMAGE_REQUIRED", "Choose an image to upload.") };
  if (value.size < 1 || value.size > IMAGE_MAX_BYTES) return { error: apiError(context, 400, "IMAGE_SIZE_INVALID", "Images must be no larger than 1 MB.") };
  const buffer = await value.arrayBuffer();
  const type = imageType(new Uint8Array(buffer));
  if (!type) return { error: apiError(context, 400, "IMAGE_TYPE_INVALID", "Choose a static PNG, JPEG, or WebP image.") };
  const extension = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const key = `${prefix}/${crypto.randomUUID()}.${extension}`;
  await context.env.MEDIA.put(key, buffer, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  return { key };
}

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join("");
}

type Cursor = { createdAt: number; id: string };
type PostRow = {
  id: string; groupId: string; authorId: string; type: Post["type"]; body: string; notes: string | null;
  createdAt: number; updatedAt: number; displayName: string; avatarKey: string | null;
  courseId: string | null; courseOwnerId: string | null; courseStatus: Course["status"] | null; courseTitle: string | null;
  courseSummary: string | null; courseLevel: string | null; courseCoverKey: string | null;
};
const NO_POST_COURSE = { courseId: null, courseOwnerId: null, courseStatus: null, courseTitle: null, courseSummary: null, courseLevel: null, courseCoverKey: null } as const;
const POST_SELECT = `SELECT p.id, p.group_id AS groupId, p.author_id AS authorId, p.type, p.body, p.notes,
      p.created_at AS createdAt, p.updated_at AS updatedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN m.state = 'active' THEN u.avatar_key ELSE m.profile_avatar_key END AS avatarKey,
      p.course_id AS courseId, co.owner_id AS courseOwnerId, co.status AS courseStatus, co.title AS courseTitle,
      co.summary AS courseSummary, co.level AS courseLevel, co.cover_key AS courseCoverKey
     FROM posts p JOIN users u ON u.id = p.author_id
     LEFT JOIN memberships m ON m.group_id = p.group_id AND m.user_id = p.author_id
     LEFT JOIN courses co ON co.id = p.course_id AND co.group_id = p.group_id`;

// A course post links to its course while the viewer may open it: published, or the owner's own draft. Archived courses are unavailable.
function presentPostCourse(row: PostRow, viewerId: string, mediaBase: string): Post["course"] {
  if (!row.courseId) return null;
  const available = row.courseStatus === "published" || (row.courseStatus === "draft" && row.courseOwnerId === viewerId);
  return available
    ? { id: row.courseId, available, title: row.courseTitle, summary: row.courseSummary, level: row.courseLevel, coverUrl: mediaUrlFromBase(mediaBase, row.courseCoverKey) }
    : { id: row.courseId, available, title: null, summary: null, level: null, coverUrl: null };
}
type ReactionRow = { targetId: string; emoji: string; userId: string; displayName: string };
type NotificationKind = Notification["kind"];

function notificationStatement(binding: D1Database, input: {
  groupId: string; recipientUserId: string; actorUserId: string; kind: NotificationKind; postId?: string | null; commentId?: string | null; courseId?: string | null; createdAt?: number;
}) {
  return binding.prepare(
    "INSERT INTO notifications (id, group_id, recipient_user_id, actor_user_id, kind, post_id, comment_id, course_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), input.groupId, input.recipientUserId, input.actorUserId, input.kind, input.postId ?? null, input.commentId ?? null, input.courseId ?? null, input.createdAt ?? Date.now());
}

async function createNotification(binding: D1Database, input: Parameters<typeof notificationStatement>[1]) {
  if (input.recipientUserId === input.actorUserId) return;
  await notificationStatement(binding, input).run();
}

async function notificationItems(binding: D1Database, recipientUserId: string, groupId?: string, restricted = false) {
  const filters = ["n.recipient_user_id = ?"];
  const values: string[] = [recipientUserId];
  if (groupId) { filters.push("n.group_id = ?"); values.push(groupId); }
  if (restricted) filters.push("n.kind IN ('join_accepted', 'join_rejected', 'member_removed')");
  const rows = await binding.prepare(
    `SELECT n.id, n.group_id AS groupId, g.name AS groupName, n.actor_user_id AS actorId,
      CASE WHEN am.state = 'active' THEN actor.display_name ELSE COALESCE(am.profile_display_name, actor.display_name) END AS actorDisplayName,
      n.kind, n.post_id AS postId, n.comment_id AS commentId, n.course_id AS courseId, n.created_at AS createdAt, n.read_at AS readAt,
      CASE WHEN n.course_id IS NOT NULL THEN co.id IS NOT NULL AND co.status != 'archived' WHEN n.post_id IS NULL THEN 1 WHEN p.id IS NULL THEN 0 WHEN n.comment_id IS NOT NULL AND c.id IS NULL THEN 0 ELSE 1 END AS targetAvailable
     FROM notifications n JOIN groups g ON g.id = n.group_id JOIN users actor ON actor.id = n.actor_user_id
     LEFT JOIN memberships am ON am.group_id = n.group_id AND am.user_id = n.actor_user_id
     LEFT JOIN posts p ON p.group_id = n.group_id AND p.id = n.post_id
     LEFT JOIN comments c ON c.group_id = n.group_id AND c.post_id = n.post_id AND c.id = n.comment_id
     LEFT JOIN courses co ON co.group_id = n.group_id AND co.id = n.course_id
     WHERE ${filters.join(" AND ")} ORDER BY n.created_at DESC, n.id DESC`,
  ).bind(...values).all<{ id: string; groupId: string; groupName: string; actorId: string; actorDisplayName: string; kind: NotificationKind; postId: string | null; commentId: string | null; courseId: string | null; createdAt: number; readAt: number | null; targetAvailable: number }>();
  return rows.results.map((row) => ({
    id: row.id, groupId: row.groupId, groupName: row.groupName,
    actor: { id: row.actorId, displayName: row.actorDisplayName }, kind: row.kind,
    postId: row.postId, commentId: row.commentId, courseId: row.courseId, targetAvailable: Boolean(row.targetAvailable),
    createdAt: row.createdAt, readAt: row.readAt,
  }));
}

function groupReactions(rows: ReactionRow[], targetId: string, viewerId: string) {
  const grouped = new Map<string, ReactionRow[]>();
  for (const row of rows) {
    if (row.targetId !== targetId) continue;
    grouped.set(row.emoji, [...(grouped.get(row.emoji) ?? []), row]);
  }
  return [...grouped.entries()].map(([emoji, members]) => ({
    emoji, count: members.length, reacted: members.some((member) => member.userId === viewerId),
    members: members.map((member) => ({ id: member.userId, displayName: member.displayName })),
  }));
}

const encodeCursor = (value: Cursor) => btoa(JSON.stringify([value.createdAt, value.id]));
const decodeCursor = (value: string | undefined): Cursor | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(atob(value));
    if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isInteger(parsed[0]) || typeof parsed[1] !== "string") return null;
    return { createdAt: parsed[0] as number, id: parsed[1] };
  } catch { return null; }
};

async function hydratePosts(binding: D1Database, rows: PostRow[], userId: string, creatorUserId: string, mediaBase: string): Promise<Post[]> {
  if (!rows.length) return [];
  const placeholders = rows.map(() => "?").join(",");
  const ids = rows.map((row) => row.id);
  const questions = await binding.prepare(
    `SELECT id, post_id AS postId, position, text FROM reading_questions WHERE post_id IN (${placeholders}) ORDER BY position ASC`,
  ).bind(...ids).all<{ id: string; postId: string; position: number; text: string }>();
  const expectedAnswers = await binding.prepare(
    `SELECT post_id AS postId, position, text FROM fill_expected_answers WHERE post_id IN (${placeholders}) ORDER BY position ASC`,
  ).bind(...ids).all<{ postId: string; position: number; text: string | null }>();
  const reactions = await binding.prepare(
    `SELECT r.target_id AS targetId, r.emoji, r.user_id AS userId,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName
     FROM reactions r JOIN users u ON u.id = r.user_id
     LEFT JOIN memberships m ON m.group_id = r.group_id AND m.user_id = r.user_id
     WHERE r.target_kind = 'post' AND r.target_id IN (${placeholders}) ORDER BY r.created_at ASC`,
  ).bind(...ids).all<ReactionRow>();
  const commentCounts = await binding.prepare(
    `SELECT post_id AS postId, COUNT(*) AS count FROM comments WHERE post_id IN (${placeholders}) GROUP BY post_id`,
  ).bind(...ids).all<{ postId: string; count: number }>();
  return rows.map((row) => ({
    id: row.id, groupId: row.groupId, type: row.type, body: row.body, notes: row.notes, course: presentPostCourse(row, userId, mediaBase),
    author: { id: row.authorId, displayName: row.displayName, avatarUrl: mediaUrlFromBase(mediaBase, row.avatarKey) },
    createdAt: row.createdAt, updatedAt: row.updatedAt, edited: row.updatedAt > row.createdAt,
    questions: questions.results.filter((question) => question.postId === row.id).map(({ id, position, text }) => ({ id, position, text })),
    expectedAnswers: row.authorId === userId
      ? expectedAnswers.results.filter((answer) => answer.postId === row.id).map(({ position, text }) => ({ position, text }))
      : [],
    commentCount: commentCounts.results.find((count) => count.postId === row.id)?.count ?? 0,
    reactionCount: reactions.results.filter((reaction) => reaction.targetId === row.id).length,
    reactions: groupReactions(reactions.results, row.id, userId),
    permissions: { edit: row.authorId === userId && row.type !== "course", delete: row.authorId === userId || creatorUserId === userId },
  }));
}

async function queryPosts(binding: D1Database, options: {
  groupId: string; userId: string; creatorUserId: string; mediaBase: string; limit: number; cursor?: Cursor | null; newer?: boolean; authorId?: string;
}) {
  const clauses = ["p.group_id = ?"];
  const bindings: Array<string | number> = [options.groupId];
  if (options.authorId) { clauses.push("p.author_id = ?"); bindings.push(options.authorId); }
  if (options.cursor) {
    clauses.push(options.newer
      ? "(p.created_at > ? OR (p.created_at = ? AND p.id > ?))"
      : "(p.created_at < ? OR (p.created_at = ? AND p.id < ?))");
    bindings.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.id);
  }
  const result = await binding.prepare(
    `${POST_SELECT}
     WHERE ${clauses.join(" AND ")} ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
  ).bind(...bindings, options.limit + 1).all<PostRow>();
  const hasMore = result.results.length > options.limit;
  const pageRows = result.results.slice(0, options.limit);
  const items = await hydratePosts(binding, pageRows, options.userId, options.creatorUserId, options.mediaBase);
  const tail = pageRows.at(-1);
  return postPageSchema.parse({ items, nextCursor: hasMore && tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null });
}

async function readPost(binding: D1Database, groupId: string, postId: string, userId: string, creatorUserId: string, mediaBase: string) {
  const row = await binding.prepare(
    `${POST_SELECT}
     WHERE p.group_id = ? AND p.id = ?`,
  ).bind(groupId, postId).first<PostRow>();
  if (!row) return null;
  return (await hydratePosts(binding, [row], userId, creatorUserId, mediaBase))[0] ?? null;
}

function postChildren(binding: D1Database, postId: string, input: PostInput): D1PreparedStatement[] {
  if (input.type === "reading") return input.questions.map((question, position) => binding.prepare(
    "INSERT INTO reading_questions (id, post_id, position, text) VALUES (?, ?, ?, ?)",
  ).bind(question.id ?? crypto.randomUUID(), postId, position, question.text.trim()));
  if (input.type === "fill_in") return input.expectedAnswers.map((answer, position) => binding.prepare(
    "INSERT INTO fill_expected_answers (post_id, position, text) VALUES (?, ?, ?)",
  ).bind(postId, position, answer?.trim() || null));
  return [];
}

type CommentRow = {
  id: string; authorId: string; parentId: string | null; kind: DiscussionItem["kind"];
  body: string | null; createdAt: number; updatedAt: number; displayName: string; pinned: number;
};

// A discussion hangs off exactly one target. Only post discussions can have pins, so practice threads pass no pin owner.
type DiscussionTarget = { column: "post_id" | "block_id"; id: string };

async function readDiscussion(binding: D1Database, groupId: string, target: DiscussionTarget, viewerId: string, creatorUserId: string, pinOwnerId: string | null) {
  const rows = await binding.prepare(
    `SELECT c.id, c.author_id AS authorId, c.parent_comment_id AS parentId, c.kind, c.body,
      c.created_at AS createdAt, c.updated_at AS updatedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN pin.comment_id = c.id THEN 1 ELSE 0 END AS pinned
     FROM comments c JOIN users u ON u.id = c.author_id
     LEFT JOIN memberships m ON m.group_id = c.group_id AND m.user_id = c.author_id
     LEFT JOIN post_pins pin ON pin.post_id = c.post_id
     WHERE c.group_id = ? AND c.${target.column} = ?
     ORDER BY CASE WHEN c.parent_comment_id IS NULL AND pin.comment_id = c.id THEN 0 ELSE 1 END, c.created_at ASC, c.id ASC`,
  ).bind(groupId, target.id).all<CommentRow>();
  const ids = rows.results.map((row) => row.id);
  const responseItems = ids.length ? await binding.prepare(
    `SELECT comment_id AS commentId, position, prompt, answer, skipped, matched FROM comment_response_items
     WHERE comment_id IN (${ids.map(() => "?").join(",")}) ORDER BY position ASC`,
  ).bind(...ids).all<{ commentId: string; position: number; prompt: string | null; answer: string; skipped: number; matched: number | null }>() : { results: [] };
  const reactions = ids.length ? await binding.prepare(
    `SELECT r.target_id AS targetId, r.emoji, r.user_id AS userId,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName
     FROM reactions r JOIN users u ON u.id = r.user_id
     LEFT JOIN memberships m ON m.group_id = r.group_id AND m.user_id = r.user_id
     WHERE r.group_id = ? AND r.target_kind = 'comment' AND r.target_id IN (${ids.map(() => "?").join(",")})
     ORDER BY r.created_at ASC`,
  ).bind(groupId, ...ids).all<ReactionRow>() : { results: [] };
  const makeItem = (row: CommentRow): DiscussionItem => ({
    id: row.id, parentId: row.parentId, kind: row.kind, body: row.body,
    author: { id: row.authorId, displayName: row.displayName, avatarUrl: null },
    createdAt: row.createdAt, updatedAt: row.updatedAt, edited: row.updatedAt > row.createdAt, pinned: Boolean(row.pinned),
    responseItems: responseItems.results.filter((item) => item.commentId === row.id).map((item) => ({
      position: item.position, prompt: item.prompt, answer: item.answer, skipped: Boolean(item.skipped), matched: item.matched === null ? null : Boolean(item.matched),
    })),
    reactions: groupReactions(reactions.results, row.id, viewerId),
    permissions: { edit: row.authorId === viewerId, delete: row.authorId === viewerId || creatorUserId === viewerId, reply: row.parentId === null, pin: pinOwnerId !== null && row.parentId === null && (pinOwnerId === viewerId || creatorUserId === viewerId) },
    replies: [],
  });
  const top = rows.results.filter((row) => row.parentId === null).map(makeItem);
  for (const item of top) item.replies = rows.results.filter((row) => row.parentId === item.id).map(makeItem);
  return top;
}

async function getPostFacts(binding: D1Database, groupId: string, postId: string) {
  return binding.prepare("SELECT id, author_id AS authorId, type FROM posts WHERE group_id = ? AND id = ?")
    .bind(groupId, postId).first<{ id: string; authorId: string; type: Post["type"] }>();
}

const normalizeAnswer = (value: string) => value.trim().toLocaleLowerCase();

async function responseStatements(binding: D1Database, commentId: string, postId: string, kind: "reading_response" | "fill_response", answers: string[], preserveSnapshots = false) {
  if (kind === "reading_response") {
    const prompts = preserveSnapshots
      ? await binding.prepare("SELECT position, prompt AS text FROM comment_response_items WHERE comment_id = ? ORDER BY position ASC").bind(commentId).all<{ position: number; text: string }>()
      : await binding.prepare("SELECT position, text FROM reading_questions WHERE post_id = ? ORDER BY position ASC").bind(postId).all<{ position: number; text: string }>();
    if (answers.length !== prompts.results.length) return null;
    return prompts.results.map((prompt, index) => {
      const answer = answers[index]?.trim() ?? "";
      return binding.prepare("INSERT INTO comment_response_items (comment_id, position, prompt, answer, skipped, matched) VALUES (?, ?, ?, ?, ?, NULL)")
        .bind(commentId, prompt.position, prompt.text, answer, answer ? 0 : 1);
    });
  }
  const expected = await binding.prepare("SELECT position, text FROM fill_expected_answers WHERE post_id = ? ORDER BY position ASC")
    .bind(postId).all<{ position: number; text: string | null }>();
  if (answers.length !== expected.results.length) return null;
  return expected.results.map((slot, index) => {
    const answer = answers[index]?.trim() ?? "";
    const matched = slot.text === null ? null : Number(normalizeAnswer(answer) === normalizeAnswer(slot.text));
    return binding.prepare("INSERT INTO comment_response_items (comment_id, position, prompt, answer, skipped, matched) VALUES (?, ?, NULL, ?, ?, ?)")
      .bind(commentId, slot.position, answer, answer ? 0 : 1, matched);
  });
}

// A comment reaction is scoped to the comment's discussion target. Practice-thread reactions create no notifications.
async function toggleReaction(context: Context<AppEnvironment>, targetKind: "post" | "comment", targetId: string, scope?: DiscussionTarget) {
  const parsed = await parseJson(context, toggleReactionRequestSchema); if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const postId = scope?.column === "post_id" ? scope.id : undefined;
  const target = targetKind === "post"
    ? await context.env.DB.prepare("SELECT id, author_id AS authorId FROM posts WHERE group_id = ? AND id = ?").bind(group.id, targetId).first<{ id: string; authorId: string }>()
    : await context.env.DB.prepare(`SELECT id, author_id AS authorId FROM comments WHERE group_id = ? AND ${scope!.column} = ? AND id = ?`).bind(group.id, scope!.id, targetId).first<{ id: string; authorId: string }>();
  if (!target) return apiError(context, 404, targetKind === "post" ? "POST_NOT_FOUND" : "COMMENT_NOT_FOUND", "This content is not available.");
  if (parsed.data.active) {
    const result = await context.env.DB.prepare(
    "INSERT INTO reactions (group_id, user_id, target_kind, target_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, target_kind, target_id, emoji) DO NOTHING",
    ).bind(group.id, user.id, targetKind, targetId, parsed.data.emoji.normalize("NFC"), Date.now()).run();
    if (result.meta.changes && scope?.column !== "block_id") await createNotification(context.env.DB, { groupId: group.id, recipientUserId: target.authorId, actorUserId: user.id, kind: "reaction", postId: targetKind === "post" ? targetId : postId, commentId: targetKind === "comment" ? targetId : null });
  }
  else await context.env.DB.prepare("DELETE FROM reactions WHERE group_id = ? AND user_id = ? AND target_kind = ? AND target_id = ? AND emoji = ?")
    .bind(group.id, user.id, targetKind, targetId, parsed.data.emoji.normalize("NFC")).run();
  const rows = await context.env.DB.prepare(
    `SELECT r.target_id AS targetId, r.emoji, r.user_id AS userId,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName
     FROM reactions r JOIN users u ON u.id = r.user_id
     LEFT JOIN memberships m ON m.group_id = r.group_id AND m.user_id = r.user_id
     WHERE r.group_id = ? AND r.target_kind = ? AND r.target_id = ? ORDER BY r.created_at ASC`,
  ).bind(group.id, targetKind, targetId).all<ReactionRow>();
  return context.json(reactionTargetResponseSchema.parse({ reactions: groupReactions(rows.results, targetId, user.id) }));
}


type CourseRow = {
  id: string; groupId: string; ownerId: string; title: string; summary: string; level: string | null; intendedLearner: string | null;
  coverKey: string | null; status: Course["status"]; firstPublishedAt: number | null; createdAt: number; updatedAt: number; displayName: string; avatarKey: string | null;
  contributorState: ContributorState | null;
};
type ContributorState = "pending" | "active" | "rejected" | "left" | "removed";

// The first bound parameter is the viewer, whose own contributor state travels with the course row.
const COURSE_SELECT = `SELECT c.id, c.group_id AS groupId, c.owner_id AS ownerId, c.title, c.summary, c.level,
    c.intended_learner AS intendedLearner, c.cover_key AS coverKey, c.status, c.first_published_at AS firstPublishedAt, c.created_at AS createdAt, c.updated_at AS updatedAt,
    CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
    CASE WHEN m.state = 'active' THEN u.avatar_key ELSE m.profile_avatar_key END AS avatarKey,
    (SELECT cc.state FROM course_contributors cc WHERE cc.course_id = c.id AND cc.user_id = ?) AS contributorState
   FROM courses c JOIN users u ON u.id = c.owner_id
   LEFT JOIN memberships m ON m.group_id = c.group_id AND m.user_id = c.owner_id`;

// Published courses are visible to every member; drafts only to the owner and active contributors; archived courses to the
// owner and group creator.
const courseVisible = (row: Pick<CourseRow, "ownerId" | "status" | "contributorState">, viewerId: string, creatorUserId: string) =>
  row.status === "published" || row.ownerId === viewerId || (row.status === "archived" && creatorUserId === viewerId)
  || (row.status === "draft" && row.contributorState === "active");

function presentCourse(row: CourseRow, viewerId: string, creatorUserId: string, mediaBase: string): Course {
  const owner = row.ownerId === viewerId;
  const active = row.status !== "archived";
  const contribution = row.contributorState === "pending" || row.contributorState === "active" ? row.contributorState : null;
  return {
    id: row.id, groupId: row.groupId, title: row.title, summary: row.summary, level: row.level, intendedLearner: row.intendedLearner,
    coverUrl: mediaUrlFromBase(mediaBase, row.coverKey), status: row.status,
    owner: { id: row.ownerId, displayName: row.displayName, avatarUrl: mediaUrlFromBase(mediaBase, row.avatarKey) },
    createdAt: row.createdAt, updatedAt: row.updatedAt, contribution,
    permissions: {
      edit: owner && active, publish: owner && active, archive: owner || creatorUserId === viewerId, removeContent: (owner || creatorUserId === viewerId) && active,
      contribute: (owner || contribution === "active") && active,
      requestContribution: !owner && row.status === "published" && contribution === null,
      leaveContribution: contribution !== null, manageContributors: owner && active,
    },
  };
}

async function readCourseRow(binding: D1Database, viewerId: string, groupId: string, courseId: string) {
  return binding.prepare(`${COURSE_SELECT} WHERE c.group_id = ? AND c.id = ?`).bind(viewerId, groupId, courseId).first<CourseRow>();
}

// Loads a course the viewer may see, or returns the error response. Invisible courses are indistinguishable from missing ones.
async function visibleCourse(context: Context<AppEnvironment>) {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const row = await readCourseRow(context.env.DB, user.id, group.id, context.req.param("courseId") ?? "");
  if (!row || !courseVisible(row, user.id, group.creatorUserId)) return { error: apiError(context, 404, "COURSE_NOT_FOUND", "This course is not available.") };
  return { row };
}

async function editableCourse(context: Context<AppEnvironment>) {
  const found = await visibleCourse(context);
  if ("error" in found) return found;
  if (found.row.ownerId !== context.get("user")!.id) return { error: apiError(context, 403, "COURSE_EDIT_FORBIDDEN", "Only the course owner can change this course.") };
  if (found.row.status === "archived") return { error: apiError(context, 409, "COURSE_ARCHIVED", "Restore this course before changing it.") };
  return found;
}

// The owner and active contributors add lessons and blocks; what a contributor may change beyond that is checked per item.
async function contributableCourse(context: Context<AppEnvironment>) {
  const found = await visibleCourse(context);
  if ("error" in found) return found;
  if (found.row.ownerId !== context.get("user")!.id && found.row.contributorState !== "active") return { error: apiError(context, 403, "COURSE_EDIT_FORBIDDEN", "Only the course owner and contributors can change this course.") };
  if (found.row.status === "archived") return { error: apiError(context, 409, "COURSE_ARCHIVED", "Restore this course before changing it.") };
  return found;
}

// Contributors work on drafts only: they may not publish, and published lessons and blocks belong to the owner.
function contributorEditError(context: Context<AppEnvironment>, course: CourseRow, current: { published: number } | null, published: boolean) {
  if (course.ownerId === context.get("user")!.id) return null;
  if (current?.published) return apiError(context, 403, "COURSE_CONTENT_PUBLISHED", "Only the course owner can change published content.");
  if (published) return apiError(context, 403, "COURSE_PUBLISH_FORBIDDEN", "Only the course owner can publish course content.");
  return null;
}

// Leaving or being removed from the group ends every contributor request and role in it.
async function endContributions(binding: D1Database, groupId: string, userId: string, state: "left" | "removed") {
  const now = Date.now();
  await binding.prepare("UPDATE course_contributors SET state = ?, decided_at = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND state IN ('pending', 'active')")
    .bind(state, now, now, groupId, userId).run();
}

async function courseResponse(context: Context<AppEnvironment>, courseId: string, status: 200 | 201 = 200) {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const row = await readCourseRow(context.env.DB, user.id, group.id, courseId);
  return context.json(courseResponseSchema.parse({ course: presentCourse(row!, user.id, group.creatorUserId, context.env.PUBLIC_MEDIA_BASE_URL) }), status);
}

type LessonRow = {
  id: string; courseId: string; title: string; goal: string | null; position: number; published: number; version: number;
  updatedById: string; updatedByName: string; updatedAt: number;
};
type BlockRow = {
  id: string; lessonId: string; position: number; kind: string; payload: string; payloadVersion: number; published: number; version: number;
  updatedById: string; updatedByName: string; updatedAt: number;
};
// Attributes the last editor, falling back to their group profile snapshot once they are no longer active.
const editorColumns = (table: string, alias: string) => `CASE WHEN em.state = 'active' THEN eu.display_name ELSE COALESCE(em.profile_display_name, 'Former member') END AS updatedByName
   FROM ${table} ${alias} JOIN users eu ON eu.id = ${alias}.updated_by
   LEFT JOIN memberships em ON em.group_id = ${alias}.group_id AND em.user_id = ${alias}.updated_by`;
const LESSON_SELECT = `SELECT l.id, l.course_id AS courseId, l.title, l.goal, l.position, l.published, l.version, l.updated_by AS updatedById,
    l.updated_at AS updatedAt, ${editorColumns("course_lessons", "l")}`;
const BLOCK_SELECT = `SELECT b.id, b.lesson_id AS lessonId, b.position, b.kind, b.payload, b.payload_version AS payloadVersion, b.published, b.version,
    b.updated_by AS updatedById, b.updated_at AS updatedAt, ${editorColumns("course_blocks", "b")}`;

// The course owner and active contributors see unpublished lessons and blocks; everyone else sees published content only.
const seesCourseDrafts = (course: CourseRow, viewerId: string) => course.ownerId === viewerId || course.contributorState === "active";

const presentLessonSummary = (row: LessonRow): CourseLessonSummary => ({
  id: row.id, position: row.position, title: row.title, goal: row.goal, published: Boolean(row.published), version: row.version,
  updatedBy: { id: row.updatedById, displayName: row.updatedByName }, updatedAt: row.updatedAt,
});

function storedBlockContent(row: Pick<BlockRow, "id" | "kind" | "payloadVersion" | "payload">) {
  const content = parseStoredBlockPayload(row.kind, row.payloadVersion, JSON.parse(row.payload));
  if (!content) throw new Error(`Course block ${row.id} has an unreadable payload.`);
  return content;
}

// Learner payloads never carry authors' versions or item notes; editors get them back as the reference so they can edit.
function presentBlock(row: BlockRow, editor: boolean, answerCounts: Map<string, number>): CourseBlock {
  const content = storedBlockContent(row);
  const base = {
    id: row.id, lessonId: row.lessonId, position: row.position, published: Boolean(row.published), version: row.version,
    updatedBy: { id: row.updatedById, displayName: row.updatedByName }, updatedAt: row.updatedAt,
  };
  if (content.kind !== "practice") return { ...base, ...content };
  const split = splitPracticePayload(content.payload);
  return { ...base, kind: "practice", payload: split.payload, reference: editor ? split.reference : null, answerCount: answerCounts.get(row.id) ?? 0 };
}

async function threadCounts(binding: D1Database, groupId: string, blockIds: string[]) {
  if (!blockIds.length) return new Map<string, number>();
  const rows = await binding.prepare(`SELECT block_id AS blockId, COUNT(*) AS total FROM comments WHERE group_id = ? AND block_id IN (${blockIds.map(() => "?").join(", ")}) GROUP BY block_id`)
    .bind(groupId, ...blockIds).all<{ blockId: string; total: number }>();
  return new Map(rows.results.map((row) => [row.blockId, row.total]));
}

async function readOutline(binding: D1Database, course: CourseRow, viewerId: string) {
  const drafts = seesCourseDrafts(course, viewerId);
  const rows = await binding.prepare(`${LESSON_SELECT} WHERE l.group_id = ? AND l.course_id = ?${drafts ? "" : " AND l.published = 1"} ORDER BY l.position, l.created_at, l.id`)
    .bind(course.groupId, course.id).all<LessonRow>();
  return rows.results;
}

async function lessonsWithBlocks(binding: D1Database, course: CourseRow, viewerId: string, lessons: LessonRow[]): Promise<CourseLesson[]> {
  if (!lessons.length) return [];
  const drafts = seesCourseDrafts(course, viewerId);
  const rows = await binding.prepare(`${BLOCK_SELECT} WHERE b.group_id = ? AND b.course_id = ? AND b.lesson_id IN (${lessons.map(() => "?").join(", ")})${drafts ? "" : " AND b.published = 1"}
    ORDER BY b.position, b.created_at, b.id`).bind(course.groupId, course.id, ...lessons.map((lesson) => lesson.id)).all<BlockRow>();
  const counts = await threadCounts(binding, course.groupId, rows.results.filter((block) => block.kind === "practice").map((block) => block.id));
  return lessons.map((lesson) => ({ ...presentLessonSummary(lesson), blocks: rows.results.filter((block) => block.lessonId === lesson.id).map((block) => presentBlock(block, drafts, counts)) }));
}

async function readLessonRow(binding: D1Database, course: CourseRow, lessonId: string) {
  return binding.prepare(`${LESSON_SELECT} WHERE l.group_id = ? AND l.course_id = ? AND l.id = ?`).bind(course.groupId, course.id, lessonId).first<LessonRow>();
}

async function readBlockRow(binding: D1Database, course: CourseRow, lessonId: string, blockId: string) {
  return binding.prepare(`${BLOCK_SELECT} WHERE b.group_id = ? AND b.course_id = ? AND b.lesson_id = ? AND b.id = ?`).bind(course.groupId, course.id, lessonId, blockId).first<BlockRow>();
}

// Resolves a lesson nested under an already-authorized course. Hidden lessons are indistinguishable from missing ones.
async function visibleLesson(context: Context<AppEnvironment>, course: CourseRow) {
  const lesson = await readLessonRow(context.env.DB, course, context.req.param("lessonId") ?? "");
  if (!lesson || (!lesson.published && !seesCourseDrafts(course, context.get("user")!.id))) return { error: apiError(context, 404, "LESSON_NOT_FOUND", "This lesson is not available.") };
  return { lesson };
}

async function visibleBlock(context: Context<AppEnvironment>, course: CourseRow, lesson: LessonRow) {
  const block = await readBlockRow(context.env.DB, course, lesson.id, context.req.param("blockId") ?? "");
  if (!block || (!block.published && !seesCourseDrafts(course, context.get("user")!.id))) return { error: apiError(context, 404, "BLOCK_NOT_FOUND", "This block is not available.") };
  return { block };
}

// Deleting is open to the course owner and, as moderation, the group creator; archived courses stay frozen for both.
async function deletableCourseContent(context: Context<AppEnvironment>) {
  const found = await visibleCourse(context);
  if ("error" in found) return found;
  const user = context.get("user")!; const group = context.get("groupAccess");
  if (found.row.ownerId !== user.id && group.creatorUserId !== user.id) return { error: apiError(context, 403, "COURSE_EDIT_FORBIDDEN", "Only the course owner can change this course.") };
  if (found.row.status === "archived") return { error: apiError(context, 409, "COURSE_ARCHIVED", "Restore this course before changing it.") };
  return found;
}

const versionConflict = (context: Context<AppEnvironment>) => apiError(context, 409, "VERSION_CONFLICT", "Someone saved a newer version first. Reload it before saving again.");

async function lessonResponse(context: Context<AppEnvironment>, course: CourseRow, lessonId: string, status: 200 | 201 = 200) {
  const lesson = await readLessonRow(context.env.DB, course, lessonId);
  const [present] = await lessonsWithBlocks(context.env.DB, course, context.get("user")!.id, [lesson!]);
  return context.json(lessonResponseSchema.parse({ lesson: present }), status);
}

async function blockResponse(context: Context<AppEnvironment>, course: CourseRow, lessonId: string, blockId: string, status: 200 | 201 = 200) {
  const block = await readBlockRow(context.env.DB, course, lessonId, blockId);
  const counts = await threadCounts(context.env.DB, course.groupId, [blockId]);
  return context.json(blockResponseSchema.parse({ block: presentBlock(block!, seesCourseDrafts(course, context.get("user")!.id), counts) }), status);
}

// Rewrites positions for one parent in a single batch. The client must send exactly the current children.
async function reorderChildren(context: Context<AppEnvironment>, table: "course_lessons" | "course_blocks", parentColumn: "course_id" | "lesson_id", parentId: string, groupId: string) {
  const parsed = await parseJson(context, reorderRequestSchema); if ("response" in parsed) return { error: parsed.response };
  const current = await context.env.DB.prepare(`SELECT id FROM ${table} WHERE group_id = ? AND ${parentColumn} = ?`).bind(groupId, parentId).all<{ id: string }>();
  const known = new Set(current.results.map((row) => row.id));
  if (parsed.data.ids.length !== known.size || new Set(parsed.data.ids).size !== known.size || parsed.data.ids.some((id) => !known.has(id))) {
    return { error: apiError(context, 409, "ORDER_STALE", "The list changed since it was loaded. Reload it and try again.") };
  }
  if (parsed.data.ids.length) {
    await context.env.DB.batch(parsed.data.ids.map((id, position) => context.env.DB.prepare(`UPDATE ${table} SET position = ? WHERE group_id = ? AND ${parentColumn} = ? AND id = ?`).bind(position, groupId, parentId, id)));
  }
  return { ok: true as const };
}

export const app = new Hono<AppEnvironment>();

const requireGroupAccess = createMiddleware<AppEnvironment>(async (context, next) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  const groupId = context.req.param("groupId");
  if (!groupId) return apiError(context, 404, "GROUP_NOT_FOUND", "This group is not available.");
  const [group] = await createDatabase(context.env.DB)
    .select({ id: groups.id, name: groups.name, language: groups.language, creatorUserId: groups.creatorUserId, invitationToken: groups.invitationToken, iconKey: groups.iconKey })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(
      eq(memberships.groupId, groupId),
      eq(memberships.userId, user.id),
      eq(memberships.state, "active"),
      isNull(groups.deletedAt),
    ))
    .limit(1);
  if (!group) return apiError(context, 404, "GROUP_NOT_FOUND", "This group is not available.");
  context.set("groupAccess", group);
  await next();
});

app.use("*", requestId());
app.use("*", async (context, next) => {
  const contentLength = Number(context.req.header("content-length") ?? 0);
  if (contentLength > 1_100_000) return apiError(context, 413, "REQUEST_TOO_LARGE", "The request is too large.");
  const startedAt = Date.now();
  await next();
  logInfo("request.complete", {
    requestId: context.get("requestId"), method: context.req.method, route: routePath(context, -1) || "unmatched",
    status: context.res.status, durationMs: Date.now() - startedAt,
  });
});
app.use("/api/*", async (context, next) => {
  if (!context.env.COOKIE_SIGNING_SECRET) throw new Error("COOKIE_SIGNING_SECRET is not configured");
  context.set("user", await readSession(context, createDatabase(context.env.DB), context.env.COOKIE_SIGNING_SECRET));
  await next();
});

app.get("/api/health", (context) => context.json(healthResponseSchema.parse({ status: "ok", service: "wordinator-api" })));

app.get("/api/media/*", async (context) => {
  const key = context.req.path.slice("/api/media/".length).split("/").map(decodeURIComponent).join("/");
  if (!key || !["avatars/", "groups/", "courses/"].some((prefix) => key.startsWith(prefix))) return apiError(context, 404, "IMAGE_NOT_FOUND", "This image is not available.");
  const object = await context.env.MEDIA.get(key);
  if (!object) return apiError(context, 404, "IMAGE_NOT_FOUND", "This image is not available.");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

app.get("/api/session", async (context) => {
  const user = context.get("user");
  if (!user) {
    return context.json({ status: "signedOut" } as const);
  }
  const database = createDatabase(context.env.DB);
  const activeGroups = await database
    .select({ 
      id: groups.id, 
      name: groups.name, 
      language: groups.language, 
      creatorUserId: groups.creatorUserId, 
      iconKey: groups.iconKey,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.state, "active"), isNull(groups.deletedAt)))
    .orderBy(asc(groups.name));
  const requests = await database
    .select({ groupId: groups.id, groupName: groups.name, state: memberships.state })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.userId, user.id), isNull(groups.deletedAt)))
    .orderBy(asc(groups.name));
  const deletedGroups = await context.env.DB.prepare(
    `SELECT g.id, g.name, g.language, g.creator_user_id AS creatorUserId, g.deleted_at AS deletedAt
     FROM memberships m JOIN groups g ON g.id = m.group_id
     WHERE m.user_id = ? AND m.state = 'active' AND g.deleted_at IS NOT NULL ORDER BY g.name ASC`,
  ).bind(user.id).all<{ id: string; name: string; language: "nl" | "de"; creatorUserId: string; deletedAt: number }>();
  return context.json({
    status: "signedIn" as const,
    user: {
      ...user,
      avatarUrl: mediaUrl(context.env, user.avatarKey)
    },
    groups: activeGroups.map((group) => ({
      id: group.id, name: group.name, language: group.language,
      role: group.creatorUserId === user.id ? "creator" as const : "member" as const,
      icon: group.language === "nl" ? "🇳🇱" : "🇩🇪",
      iconUrl: mediaUrl(context.env, group.iconKey),
      members: 16
    })),
    requests: requests.filter((request) => request.state !== "active")
      .map(({ groupId, groupName, state }) => ({ groupId, groupName, state })),
    deletedGroups: deletedGroups.results.map((group) => ({
      id: group.id, name: group.name, language: group.language, deletedAt: group.deletedAt,
      role: group.creatorUserId === user.id ? "creator" as const : "member" as const,
    })),
  });
});

app.post("/api/auth/sign-in", async (context) => {
  const parsed = await parseJson(context, signInRequestSchema);
  if ("response" in parsed) return parsed.response;
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const clientAddress = context.req.header("cf-connecting-ip") ?? "local";
  const attemptKey = await sha256(`${clientAddress}|${normalizedEmail}`);
  const now = Date.now();
  const attempt = await context.env.DB.prepare(
    "SELECT failures, window_started_at AS windowStartedAt, blocked_until AS blockedUntil FROM login_attempts WHERE key = ?",
  ).bind(attemptKey).first<{ failures: number; windowStartedAt: number; blockedUntil: number | null }>();
  if (attempt?.blockedUntil && attempt.blockedUntil > now) {
    context.header("Retry-After", String(Math.ceil((attempt.blockedUntil - now) / 1000)));
    return apiError(context, 429, "LOGIN_THROTTLED", "Too many attempts. Wait a while and try again.");
  }
  const database = createDatabase(context.env.DB);
  const [account] = await database.select().from(users).where(eq(users.normalizedEmail, normalizedEmail)).limit(1);
  const valid = await verifyPassword(parsed.data.password, account?.passwordHash ?? FALLBACK_HASH);
  if (!account || !valid) {
    const reset = !attempt || now - attempt.windowStartedAt >= LOGIN_WINDOW_MS;
    const failures = reset ? 1 : attempt.failures + 1;
    const windowStartedAt = reset ? now : attempt.windowStartedAt;
    const blockedUntil = failures >= LOGIN_LIMIT ? now + LOGIN_WINDOW_MS : null;
    await context.env.DB.prepare(
      "INSERT INTO login_attempts (key, failures, window_started_at, blocked_until) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_started_at = excluded.window_started_at, blocked_until = excluded.blocked_until",
    ).bind(attemptKey, failures, windowStartedAt, blockedUntil).run();
    return apiError(context, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  await context.env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(attemptKey).run();
  await setSession(context, account.id, context.env.COOKIE_SIGNING_SECRET);
  return context.json({ ok: true } as const);
});

app.post("/api/auth/sign-out", (context) => {
  clearSession(context);
  return context.json({ ok: true } as const);
});

app.post("/api/auth/change-password", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const parsed = await parseJson(context, changePasswordRequestSchema);
  if ("response" in parsed) return parsed.response;
  const database = createDatabase(context.env.DB);
  const [account] = await database.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (!user.mustChangePassword) {
    if (!parsed.data.currentPassword || !await verifyPassword(parsed.data.currentPassword, account.passwordHash)) {
      return apiError(context, 403, "CURRENT_PASSWORD_INCORRECT", "The current password is incorrect.");
    }
  }
  const passwordHash = await hashPassword(parsed.data.password);
  await database.update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: Date.now() })
    .where(eq(users.id, user.id));
  return context.json({ ok: true } as const);
});

app.get("/api/settings", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const [account] = await createDatabase(context.env.DB).select({
    email: users.email,
    displayName: users.displayName,
    bio: users.bio,
    avatarKey: users.avatarKey,
    quickReactionOne: users.quickReactionOne,
    quickReactionTwo: users.quickReactionTwo,
    quickReactionThree: users.quickReactionThree,
  }).from(users).where(eq(users.id, user.id)).limit(1);
  if (!account) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  return context.json(accountSettingsResponseSchema.parse({
    email: account.email,
    displayName: account.displayName,
    bio: account.bio ?? "",
    avatarUrl: mediaUrl(context.env, account.avatarKey),
    quickReactions: [account.quickReactionOne, account.quickReactionTwo, account.quickReactionThree],
  }));
});

app.patch("/api/settings", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  const parsed = await parseJson(context, updateAccountSettingsRequestSchema);
  if ("response" in parsed) return parsed.response;
  const now = Date.now();
  const displayName = parsed.data.displayName.trim();
  const bio = parsed.data.bio.trim() || null;
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE users SET display_name = ?, bio = ?, quick_reaction_one = ?, quick_reaction_two = ?, quick_reaction_three = ?, updated_at = ? WHERE id = ?",
    ).bind(displayName, bio, ...parsed.data.quickReactions, now, user.id),
    context.env.DB.prepare(
      "UPDATE memberships SET profile_display_name = ?, profile_bio = ?, updated_at = ? WHERE user_id = ? AND state = 'active'",
    ).bind(displayName, bio, now, user.id),
  ]);
  return context.json({ ok: true } as const);
});

app.post("/api/settings/avatar", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  const uploaded = await uploadedImage(context, "avatars");
  if ("error" in uploaded) return uploaded.error;
  const previous = await context.env.DB.prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
  const now = Date.now();
  try {
    await context.env.DB.batch([
      context.env.DB.prepare("UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?").bind(uploaded.key, now, user.id),
      context.env.DB.prepare("UPDATE memberships SET profile_avatar_key = ?, updated_at = ? WHERE user_id = ? AND state = 'active'").bind(uploaded.key, now, user.id),
    ]);
  } catch (error) {
    await context.env.MEDIA.delete(uploaded.key);
    throw error;
  }
  if (previous?.avatarKey) await context.env.MEDIA.delete(previous.avatarKey);
  return context.json(imageResponseSchema.parse({ url: mediaUrl(context.env, uploaded.key) }));
});

app.delete("/api/settings/avatar", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const previous = await context.env.DB.prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE users SET avatar_key = NULL, updated_at = ? WHERE id = ?").bind(now, user.id),
    context.env.DB.prepare("UPDATE memberships SET profile_avatar_key = NULL, updated_at = ? WHERE user_id = ? AND state = 'active'").bind(now, user.id),
  ]);
  if (previous?.avatarKey) await context.env.MEDIA.delete(previous.avatarKey);
  return context.json({ ok: true } as const);
});

app.get("/api/invitations/:token", async (context) => {
  const [group] = await createDatabase(context.env.DB)
    .select({ id: groups.id, name: groups.name, language: groups.language }).from(groups)
    .where(and(eq(groups.invitationToken, context.req.param("token")), isNull(groups.deletedAt))).limit(1);
  if (!group) return apiError(context, 404, "INVITATION_NOT_FOUND", "This invitation is not available.");
  return context.json({ groupId: group.id, groupName: group.name, language: group.language });
});

app.post("/api/auth/register", async (context) => {
  if (context.get("user")) return apiError(context, 409, "ALREADY_SIGNED_IN", "Sign out before creating another account.");
  const parsed = await parseJson(context, registerRequestSchema);
  if ("response" in parsed) return parsed.response;
  const database = createDatabase(context.env.DB);
  const [group] = await database.select({ id: groups.id, creatorUserId: groups.creatorUserId }).from(groups)
    .where(and(eq(groups.invitationToken, parsed.data.invitationToken), isNull(groups.deletedAt))).limit(1);
  if (!group) return apiError(context, 404, "INVITATION_NOT_FOUND", "This invitation is not available.");
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const [existing] = await database.select({ id: users.id }).from(users).where(eq(users.normalizedEmail, normalizedEmail)).limit(1);
  if (existing) return apiError(context, 409, "ACCOUNT_EXISTS", "An account already uses this email. Sign in instead.");
  const userId = crypto.randomUUID();
  const now = Date.now();
  const passwordHash = await hashPassword(parsed.data.password);
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
      .bind(userId, parsed.data.email.trim(), normalizedEmail, passwordHash, parsed.data.displayName.trim(), "👍", "❤️", "😂", now, now),
    context.env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, profile_display_name, updated_at) VALUES (?, ?, 'pending', ?, ?, ?)")
      .bind(group.id, userId, now, parsed.data.displayName.trim(), now),
    ...(group.creatorUserId === userId ? [] : [notificationStatement(context.env.DB, { groupId: group.id, recipientUserId: group.creatorUserId, actorUserId: userId, kind: "join_requested", createdAt: now })]),
  ]);
  await setSession(context, userId, context.env.COOKIE_SIGNING_SECRET);
  return context.json({ ok: true } as const, 201);
});

app.post("/api/invitations/:token/request", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  const [group] = await createDatabase(context.env.DB).select({ id: groups.id, creatorUserId: groups.creatorUserId }).from(groups)
    .where(and(eq(groups.invitationToken, context.req.param("token")), isNull(groups.deletedAt))).limit(1);
  if (!group) return apiError(context, 404, "INVITATION_NOT_FOUND", "This invitation is not available.");
  const previous = await context.env.DB.prepare("SELECT state FROM memberships WHERE group_id = ? AND user_id = ?").bind(group.id, user.id).first<{ state: string }>();
  const now = Date.now();
  await context.env.DB.prepare(
    "INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, updated_at) VALUES (?, ?, 'pending', ?, NULL, ?) " +
    "ON CONFLICT(group_id, user_id) DO UPDATE SET state = CASE WHEN memberships.state = 'active' THEN 'active' ELSE 'pending' END, " +
    "requested_at = CASE WHEN memberships.state = 'active' THEN memberships.requested_at ELSE excluded.requested_at END, " +
    "decided_at = CASE WHEN memberships.state = 'active' THEN memberships.decided_at ELSE NULL END, updated_at = excluded.updated_at",
  ).bind(group.id, user.id, now, now).run();
  if (previous?.state !== "active") await createNotification(context.env.DB, { groupId: group.id, recipientUserId: group.creatorUserId, actorUserId: user.id, kind: "join_requested", createdAt: now });
  return context.json({ ok: true } as const);
});

app.post("/api/groups", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  const database = createDatabase(context.env.DB);
  const [eligible] = await database.select({ groupId: memberships.groupId }).from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.state, "active"))).limit(1);
  if (!eligible) return apiError(context, 403, "ACTIVE_MEMBERSHIP_REQUIRED", "Join a group before creating one.");
  const parsed = await parseJson(context, createGroupRequestSchema);
  if ("response" in parsed) return parsed.response;
  const groupId = crypto.randomUUID();
  const now = Date.now();
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(groupId, user.id, parsed.data.name.trim(), parsed.data.language, newInvitationToken(), now, now),
    context.env.DB.prepare("INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)")
      .bind(groupId, user.id, now, now, user.displayName, now),
  ]);
  return context.json({ group: {
    id: groupId, name: parsed.data.name.trim(), language: parsed.data.language,
    role: "creator" as const, icon: parsed.data.language === "nl" ? "🇳🇱" : "🇩🇪", iconUrl: null,
  } }, 201);
});

app.get("/api/groups/:groupId", requireGroupAccess, async (context) => {
  const user = context.get("user")!;
  const groupId = context.req.param("groupId");
  const database = createDatabase(context.env.DB);
  const group = context.get("groupAccess");
  const pendingRequestCount = group.creatorUserId === user.id
    ? (await database.select({ count: count() }).from(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.state, "pending"))))[0]?.count ?? 0
    : 0;
  return context.json({
    group: {
      id: group.id, name: group.name, language: group.language,
      role: group.creatorUserId === user.id ? "creator" as const : "member" as const,
      icon: group.language === "nl" ? "🇳🇱" : "🇩🇪",
      iconUrl: mediaUrl(context.env, group.iconKey),
    },
    invitationToken: group.invitationToken,
    pendingRequestCount,
  });
});

app.patch("/api/groups/:groupId", requireGroupAccess, async (context) => {
  const user = context.get("user")!;
  const group = context.get("groupAccess");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can rename this group.");
  const parsed = await parseJson(context, renameGroupRequestSchema);
  if ("response" in parsed) return parsed.response;
  await createDatabase(context.env.DB).update(groups)
    .set({ name: parsed.data.name.trim(), updatedAt: Date.now() })
    .where(eq(groups.id, group.id));
  return context.json({ ok: true } as const);
});

app.post("/api/groups/:groupId/icon", requireGroupAccess, async (context) => {
  const user = context.get("user")!; const group = context.get("groupAccess");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can update its icon.");
  const uploaded = await uploadedImage(context, "groups");
  if ("error" in uploaded) return uploaded.error;
  try {
    await context.env.DB.prepare("UPDATE groups SET icon_key = ?, updated_at = ? WHERE id = ?").bind(uploaded.key, Date.now(), group.id).run();
  } catch (error) {
    await context.env.MEDIA.delete(uploaded.key);
    throw error;
  }
  if (group.iconKey) await context.env.MEDIA.delete(group.iconKey);
  return context.json(imageResponseSchema.parse({ url: mediaUrl(context.env, uploaded.key) }));
});

app.delete("/api/groups/:groupId/icon", requireGroupAccess, async (context) => {
  const user = context.get("user")!; const group = context.get("groupAccess");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can update its icon.");
  await context.env.DB.prepare("UPDATE groups SET icon_key = NULL, updated_at = ? WHERE id = ?").bind(Date.now(), group.id).run();
  if (group.iconKey) await context.env.MEDIA.delete(group.iconKey);
  return context.json({ ok: true } as const);
});

app.delete("/api/groups/:groupId", requireGroupAccess, async (context) => {
  const user = context.get("user")!; const group = context.get("groupAccess");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can delete this group.");
  const parsed = await parseJson(context, memberLifecycleRequestSchema);
  if ("response" in parsed) return parsed.response;
  await context.env.DB.prepare("UPDATE groups SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(Date.now(), Date.now(), group.id).run();
  return context.json({ ok: true } as const);
});

app.post("/api/groups/:groupId/restore", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  if (user.mustChangePassword) return apiError(context, 403, "PASSWORD_CHANGE_REQUIRED", "Change your password to continue.");
  const result = await context.env.DB.prepare("UPDATE groups SET deleted_at = NULL, updated_at = ? WHERE id = ? AND creator_user_id = ? AND deleted_at IS NOT NULL")
    .bind(Date.now(), context.req.param("groupId"), user.id).run();
  if (!result.meta.changes) return apiError(context, 404, "DELETED_GROUP_NOT_FOUND", "This deleted group is not available.");
  return context.json({ ok: true } as const);
});

app.get("/api/groups/:groupId/posts", requireGroupAccess, async (context) => {
  const parsed = feedQuerySchema.safeParse(context.req.query());
  if (!parsed.success) return apiError(context, 400, "INVALID_CURSOR", "The feed cursor is invalid.");
  const cursorValue = parsed.data.newerThan ?? parsed.data.cursor;
  const cursor = decodeCursor(cursorValue);
  if (cursorValue && !cursor) return apiError(context, 400, "INVALID_CURSOR", "The feed cursor is invalid.");
  const user = context.get("user")!;
  const group = context.get("groupAccess");
  return context.json(await queryPosts(context.env.DB, {
    groupId: group.id, userId: user.id, creatorUserId: group.creatorUserId,
    mediaBase: context.env.PUBLIC_MEDIA_BASE_URL,
    limit: parsed.data.limit, cursor, newer: Boolean(parsed.data.newerThan),
  }));
});

app.post("/api/groups/:groupId/posts", requireGroupAccess, async (context) => {
  const parsed = await parseJson(context, createPostRequestSchema);
  if ("response" in parsed) return parsed.response;
  const user = context.get("user")!;
  const group = context.get("groupAccess");
  const postId = crypto.randomUUID();
  const latest = await context.env.DB.prepare("SELECT MAX(created_at) AS createdAt FROM posts WHERE group_id = ?")
    .bind(group.id).first<{ createdAt: number | null }>();
  const now = Math.max(Date.now(), (latest?.createdAt ?? 0) + 1);
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO posts (id, group_id, author_id, type, body, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(postId, group.id, user.id, parsed.data.type, parsed.data.body.trim(), parsed.data.notes?.trim() || null, now, now),
    ...postChildren(context.env.DB, postId, parsed.data),
  ]);
  const accountMedia = await context.env.DB.prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
  const [post] = await hydratePosts(context.env.DB, [{
    id: postId, groupId: group.id, authorId: user.id, type: parsed.data.type,
    body: parsed.data.body.trim(), notes: parsed.data.notes?.trim() || null,
    createdAt: now, updatedAt: now, displayName: user.displayName, avatarKey: accountMedia?.avatarKey ?? null, ...NO_POST_COURSE,
  }], user.id, group.creatorUserId, context.env.PUBLIC_MEDIA_BASE_URL);
  return context.json({ post: post! }, 201);
});

app.get("/api/groups/:groupId/posts/:postId", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess");
  const user = context.get("user")!;
  const post = await readPost(context.env.DB, group.id, context.req.param("postId"), user.id, group.creatorUserId, context.env.PUBLIC_MEDIA_BASE_URL);
  if (!post) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  return context.json(postResponseSchema.parse({ post }));
});

app.patch("/api/groups/:groupId/posts/:postId", requireGroupAccess, async (context) => {
  const user = context.get("user")!;
  const group = context.get("groupAccess");
  const existing = await context.env.DB.prepare(
    "SELECT author_id AS authorId, type, created_at AS createdAt FROM posts WHERE group_id = ? AND id = ?",
  ).bind(group.id, context.req.param("postId")).first<{ authorId: string; type: Post["type"]; createdAt: number }>();
  if (!existing) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  if (existing.authorId !== user.id) return apiError(context, 403, "POST_EDIT_FORBIDDEN", "Only the author can edit this post.");
  if (existing.type === "course") return apiError(context, 409, "POST_NOT_EDITABLE", "Course posts are created by the course and cannot be edited.");
  const parsed = await parseJson(context, updatePostRequestSchema);
  if ("response" in parsed) return parsed.response;
  const postId = context.req.param("postId");
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM reading_questions WHERE post_id = ?").bind(postId),
    context.env.DB.prepare("DELETE FROM fill_expected_answers WHERE post_id = ?").bind(postId),
    ...(parsed.data.type === "shared_sentence" ? [context.env.DB.prepare("DELETE FROM post_pins WHERE post_id = ?").bind(postId)] : []),
    context.env.DB.prepare("UPDATE posts SET type = ?, body = ?, notes = ?, updated_at = ? WHERE group_id = ? AND id = ?")
      .bind(parsed.data.type, parsed.data.body.trim(), parsed.data.notes?.trim() || null, Math.max(Date.now(), existing.createdAt + 1), group.id, postId),
    ...postChildren(context.env.DB, postId, parsed.data),
  ]);
  const response = await readPost(context.env.DB, group.id, postId, user.id, group.creatorUserId, context.env.PUBLIC_MEDIA_BASE_URL);
  return context.json(postResponseSchema.parse({ post: response }));
});

app.delete("/api/groups/:groupId/posts/:postId", requireGroupAccess, async (context) => {
  const user = context.get("user")!;
  const group = context.get("groupAccess");
  const existing = await context.env.DB.prepare(
    "SELECT author_id AS authorId FROM posts WHERE group_id = ? AND id = ?",
  ).bind(group.id, context.req.param("postId")).first<{ authorId: string }>();
  if (!existing) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  if (existing.authorId !== user.id && group.creatorUserId !== user.id) return apiError(context, 403, "POST_DELETE_FORBIDDEN", "You cannot delete this post.");
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM reactions WHERE group_id = ? AND target_kind = 'post' AND target_id = ?").bind(group.id, context.req.param("postId")),
    context.env.DB.prepare("DELETE FROM reactions WHERE group_id = ? AND target_kind = 'comment' AND target_id IN (SELECT id FROM comments WHERE group_id = ? AND post_id = ?)").bind(group.id, group.id, context.req.param("postId")),
    context.env.DB.prepare("DELETE FROM comments WHERE group_id = ? AND post_id = ?").bind(group.id, context.req.param("postId")),
    context.env.DB.prepare("DELETE FROM reading_questions WHERE post_id = ?").bind(context.req.param("postId")),
    context.env.DB.prepare("DELETE FROM fill_expected_answers WHERE post_id = ?").bind(context.req.param("postId")),
    context.env.DB.prepare("DELETE FROM posts WHERE group_id = ? AND id = ?").bind(group.id, context.req.param("postId")),
  ]);
  return context.json({ ok: true } as const);
});

app.get("/api/groups/:groupId/posts/:postId/discussion", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const post = await getPostFacts(context.env.DB, group.id, context.req.param("postId"));
  if (!post) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  const [items, account] = await Promise.all([
    readDiscussion(context.env.DB, group.id, { column: "post_id", id: post.id }, user.id, group.creatorUserId, post.authorId),
    context.env.DB.prepare("SELECT quick_reaction_one AS one, quick_reaction_two AS two, quick_reaction_three AS three FROM users WHERE id = ?")
      .bind(user.id).first<{ one: string; two: string; three: string }>(),
  ]);
  return context.json(discussionResponseSchema.parse({
    items, count: items.reduce((count, item) => count + 1 + item.replies.length, 0),
    concealed: post.type !== "shared_sentence" && post.type !== "course", quickReactions: [account!.one, account!.two, account!.three],
  }));
});

app.post("/api/groups/:groupId/posts/:postId/comments", requireGroupAccess, async (context) => {
  const parsed = await parseJson(context, createCommentRequestSchema);
  if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!; const postId = context.req.param("postId");
  const post = await getPostFacts(context.env.DB, group.id, postId);
  if (!post) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parsed.data.kind === "text" && parsed.data.parentId) {
    const parent = await context.env.DB.prepare("SELECT id, author_id AS authorId, parent_comment_id AS parentId FROM comments WHERE group_id = ? AND post_id = ? AND id = ?")
      .bind(group.id, postId, parsed.data.parentId).first<{ id: string; authorId: string; parentId: string | null }>();
    if (!parent || parent.parentId) return apiError(context, 400, "INVALID_PARENT", "Replies can only be added to a top-level response in this post.");
    parentId = parent.id;
    parentAuthorId = parent.authorId;
  }
  if (!parentId) {
    const expectedKind = post.type === "reading" ? "reading_response" : post.type === "fill_in" ? "fill_response" : "text";
    if (parsed.data.kind !== expectedKind) return apiError(context, 400, "INVALID_RESPONSE_KIND", "This response does not match the post type.");
  } else if (parsed.data.kind !== "text") return apiError(context, 400, "INVALID_RESPONSE_KIND", "Replies must be plain text.");
  const commentId = crypto.randomUUID(); const now = Date.now();
  const children = parsed.data.kind === "reading_response" || parsed.data.kind === "fill_response"
    ? await responseStatements(context.env.DB, commentId, postId, parsed.data.kind, parsed.data.answers) : [];
  if (children === null) return apiError(context, 400, "ANSWER_COUNT_MISMATCH", "Answer every prompt, leaving a blank response when needed.");
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO comments (id, group_id, post_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(commentId, group.id, postId, user.id, parentId, parsed.data.kind, parsed.data.kind === "text" ? parsed.data.body.trim() : null, now, now),
    ...children,
    ...(user.id === (parentAuthorId ?? post.authorId) ? [] : [notificationStatement(context.env.DB, {
      groupId: group.id, recipientUserId: parentAuthorId ?? post.authorId, actorUserId: user.id,
      kind: parentId ? "reply" : "post_response", postId, commentId, createdAt: now,
    })]),
  ]);
  const item = (await readDiscussion(context.env.DB, group.id, { column: "post_id", id: postId }, user.id, group.creatorUserId, post.authorId))
    .flatMap((entry) => [entry, ...entry.replies]).find((entry) => entry.id === commentId)!;
  return context.json(commentResponseSchema.parse({ item }), 201);
});

app.patch("/api/groups/:groupId/posts/:postId/comments/:commentId", requireGroupAccess, async (context) => {
  const parsed = await parseJson(context, updateCommentRequestSchema);
  if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!; const postId = context.req.param("postId");
  const existing = await context.env.DB.prepare("SELECT c.author_id AS authorId, c.kind, c.created_at AS createdAt, p.author_id AS postAuthorId FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.group_id = ? AND c.post_id = ? AND c.id = ?")
    .bind(group.id, postId, context.req.param("commentId")).first<{ authorId: string; kind: DiscussionItem["kind"]; createdAt: number; postAuthorId: string }>();
  if (!existing) return apiError(context, 404, "COMMENT_NOT_FOUND", "This response is not available.");
  if (existing.authorId !== user.id) return apiError(context, 403, "COMMENT_EDIT_FORBIDDEN", "Only the author can edit this response.");
  if (existing.kind !== parsed.data.kind) return apiError(context, 400, "INVALID_RESPONSE_KIND", "The response type cannot be changed.");
  const children = parsed.data.kind === "reading_response" || parsed.data.kind === "fill_response"
    ? await responseStatements(context.env.DB, context.req.param("commentId"), postId, parsed.data.kind, parsed.data.answers, true) : [];
  if (children === null) return apiError(context, 400, "ANSWER_COUNT_MISMATCH", "Answer every prompt, leaving a blank response when needed.");
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM comment_response_items WHERE comment_id = ?").bind(context.req.param("commentId")),
    context.env.DB.prepare("UPDATE comments SET body = ?, updated_at = ? WHERE group_id = ? AND post_id = ? AND id = ?")
      .bind(parsed.data.kind === "text" ? parsed.data.body.trim() : null, Math.max(Date.now(), existing.createdAt + 1), group.id, postId, context.req.param("commentId")),
    ...children,
  ]);
  const item = (await readDiscussion(context.env.DB, group.id, { column: "post_id", id: postId }, user.id, group.creatorUserId, existing.postAuthorId))
    .flatMap((entry) => [entry, ...entry.replies]).find((entry) => entry.id === context.req.param("commentId"))!;
  return context.json(commentResponseSchema.parse({ item }));
});

app.delete("/api/groups/:groupId/posts/:postId/comments/:commentId", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!; const postId = context.req.param("postId"); const commentId = context.req.param("commentId");
  const existing = await context.env.DB.prepare("SELECT author_id AS authorId FROM comments WHERE group_id = ? AND post_id = ? AND id = ?")
    .bind(group.id, postId, commentId).first<{ authorId: string }>();
  if (!existing) return apiError(context, 404, "COMMENT_NOT_FOUND", "This response is not available.");
  if (existing.authorId !== user.id && group.creatorUserId !== user.id) return apiError(context, 403, "COMMENT_DELETE_FORBIDDEN", "You cannot delete this response.");
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM reactions WHERE group_id = ? AND target_kind = 'comment' AND (target_id = ? OR target_id IN (SELECT id FROM comments WHERE parent_comment_id = ?))").bind(group.id, commentId, commentId),
    context.env.DB.prepare("DELETE FROM comments WHERE group_id = ? AND post_id = ? AND (id = ? OR parent_comment_id = ?)").bind(group.id, postId, commentId, commentId),
  ]);
  return context.json({ ok: true } as const);
});

app.put("/api/groups/:groupId/posts/:postId/pin", requireGroupAccess, async (context) => {
  const parsed = await parseJson(context, pinRequestSchema); if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!; const postId = context.req.param("postId");
  const post = await getPostFacts(context.env.DB, group.id, postId);
  if (!post) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  if (post.type === "shared_sentence" || post.type === "course") return apiError(context, 400, "PIN_UNAVAILABLE", "Comments on this post cannot be pinned.");
  if (post.authorId !== user.id && group.creatorUserId !== user.id) return apiError(context, 403, "PIN_FORBIDDEN", "Only the post author or group creator can pin an answer.");
  const previousPin = await context.env.DB.prepare("SELECT comment_id AS commentId FROM post_pins WHERE post_id = ?").bind(postId).first<{ commentId: string }>();
  if (!parsed.data.commentId) await context.env.DB.prepare("DELETE FROM post_pins WHERE post_id = ?").bind(postId).run();
  else {
    const item = await context.env.DB.prepare("SELECT id, author_id AS authorId FROM comments WHERE group_id = ? AND post_id = ? AND id = ? AND parent_comment_id IS NULL")
      .bind(group.id, postId, parsed.data.commentId).first<{ id: string; authorId: string }>();
    if (!item) return apiError(context, 400, "INVALID_PIN", "Only a top-level answer from this post can be pinned.");
    await context.env.DB.prepare("INSERT INTO post_pins (post_id, comment_id, pinned_by_user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(post_id) DO UPDATE SET comment_id = excluded.comment_id, pinned_by_user_id = excluded.pinned_by_user_id, created_at = excluded.created_at")
      .bind(postId, parsed.data.commentId, user.id, Date.now()).run();
    if (previousPin?.commentId !== parsed.data.commentId) await createNotification(context.env.DB, { groupId: group.id, recipientUserId: item.authorId, actorUserId: user.id, kind: "answer_pinned", postId, commentId: parsed.data.commentId });
  }
  return context.json({ ok: true } as const);
});

app.put("/api/groups/:groupId/posts/:postId/reactions", requireGroupAccess, async (context) => {
  return toggleReaction(context, "post", context.req.param("postId"));
});

app.put("/api/groups/:groupId/posts/:postId/comments/:commentId/reactions", requireGroupAccess, async (context) => {
  return toggleReaction(context, "comment", context.req.param("commentId"), { column: "post_id", id: context.req.param("postId") });
});

app.get("/api/groups/:groupId/notifications", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  return context.json(notificationPageSchema.parse({ items: await notificationItems(context.env.DB, user.id, group.id) }));
});

app.patch("/api/groups/:groupId/notifications/:notificationId/read", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const result = await context.env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND group_id = ? AND recipient_user_id = ?")
    .bind(Date.now(), context.req.param("notificationId"), group.id, user.id).run();
  if (!result.meta.changes) return apiError(context, 404, "NOTIFICATION_NOT_FOUND", "This notification is not available.");
  return context.json({ ok: true } as const);
});

app.post("/api/groups/:groupId/notifications/read-all", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  await context.env.DB.prepare("UPDATE notifications SET read_at = ? WHERE group_id = ? AND recipient_user_id = ? AND read_at IS NULL")
    .bind(Date.now(), group.id, user.id).run();
  return context.json({ ok: true } as const);
});

app.get("/api/notifications/status", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  return context.json(restrictedNotificationPageSchema.parse({ items: await notificationItems(context.env.DB, user.id, undefined, true) }));
});

app.patch("/api/notifications/status/:notificationId/read", async (context) => {
  const user = context.get("user");
  if (!user) return apiError(context, 401, "AUTH_REQUIRED", "Sign in to continue.");
  const result = await context.env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_user_id = ? AND kind IN ('join_accepted', 'join_rejected', 'member_removed')")
    .bind(Date.now(), context.req.param("notificationId"), user.id).run();
  if (!result.meta.changes) return apiError(context, 404, "NOTIFICATION_NOT_FOUND", "This notification is not available.");
  return context.json({ ok: true } as const);
});

app.get("/api/groups/:groupId/members", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const viewer = context.get("user")!;
  const rows = await context.env.DB.prepare(
    `SELECT u.id, m.state, m.requested_at AS joinedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN m.state = 'active' THEN u.bio ELSE m.profile_bio END AS bio,
      CASE WHEN m.state = 'active' THEN u.avatar_key ELSE m.profile_avatar_key END AS avatarKey
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ? AND m.state IN ('active', 'left', 'removed')
     ORDER BY CASE WHEN m.state = 'active' THEN 0 ELSE 1 END, displayName COLLATE NOCASE ASC`,
  ).bind(group.id).all<{ id: string; state: "active" | "left" | "removed"; joinedAt: number; displayName: string; bio: string | null; avatarKey: string | null }>();
  const items = rows.results.map((member) => ({
    id: member.id, displayName: member.displayName, bio: member.bio, avatarUrl: mediaUrl(context.env, member.avatarKey),
    membership: member.state === "active" ? "active" as const : "former" as const,
    isCreator: member.id === group.creatorUserId, joinedAt: member.joinedAt,
  }));
  return context.json(memberDirectoryResponseSchema.parse({
    active: items.filter((member) => member.membership === "active"),
    former: items.filter((member) => member.membership === "former"),
    permissions: { leave: viewer.id !== group.creatorUserId },
  }));
});

app.get("/api/groups/:groupId/memberships", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const viewer = context.get("user")!;
  if (group.creatorUserId !== viewer.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can manage members.");
  // Active, pending, and rejected rows show current account fields; departed rows keep their frozen snapshot.
  const rows = await context.env.DB.prepare(
    `SELECT u.id, m.state, m.requested_at AS requestedAt, m.decided_at AS decidedAt,
      CASE WHEN m.state IN ('left', 'removed') THEN COALESCE(m.profile_display_name, 'Former member') ELSE u.display_name END AS displayName,
      CASE WHEN m.state IN ('left', 'removed') THEN m.profile_avatar_key ELSE u.avatar_key END AS avatarKey
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ?`,
  ).bind(group.id).all<{ id: string; state: "pending" | "active" | "rejected" | "left" | "removed"; requestedAt: number; decidedAt: number | null; displayName: string; avatarKey: string | null }>();
  const items = rows.results.map((row) => ({
    id: row.id, displayName: row.displayName, avatarUrl: mediaUrl(context.env, row.avatarKey), state: row.state,
    isCreator: row.id === group.creatorUserId, requestedAt: row.requestedAt, decidedAt: row.decidedAt,
  }));
  const byName = (a: { displayName: string }, b: { displayName: string }) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
  const byRecentDecision = (a: { decidedAt: number | null }, b: { decidedAt: number | null }) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0);
  return context.json(membershipAdminResponseSchema.parse({
    pending: items.filter((item) => item.state === "pending").sort((a, b) => a.requestedAt - b.requestedAt),
    active: items.filter((item) => item.state === "active").sort(byName),
    rejected: items.filter((item) => item.state === "rejected").sort(byRecentDecision),
    former: items.filter((item) => item.state === "left" || item.state === "removed").sort(byRecentDecision),
  }));
});

app.post("/api/groups/:groupId/memberships/leave", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!;
  if (group.creatorUserId === user.id) return apiError(context, 403, "CREATOR_CANNOT_LEAVE", "The group creator cannot leave.");
  const parsed = await parseJson(context, memberLifecycleRequestSchema);
  if ("response" in parsed) return parsed.response;
  const result = await context.env.DB.prepare("UPDATE memberships SET state = 'left', decided_at = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND state = 'active'")
    .bind(Date.now(), Date.now(), group.id, user.id).run();
  if (!result.meta.changes) return apiError(context, 404, "MEMBERSHIP_NOT_FOUND", "This membership is not active.");
  await endContributions(context.env.DB, group.id, user.id, "left");
  return context.json({ ok: true } as const);
});

app.delete("/api/groups/:groupId/memberships/:userId", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!; const targetId = context.req.param("userId");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can remove members.");
  if (targetId === group.creatorUserId) return apiError(context, 400, "CREATOR_CANNOT_BE_REMOVED", "The group creator cannot be removed.");
  const parsed = await parseJson(context, memberLifecycleRequestSchema);
  if ("response" in parsed) return parsed.response;
  const result = await context.env.DB.prepare("UPDATE memberships SET state = 'removed', decided_at = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND state = 'active'")
    .bind(Date.now(), Date.now(), group.id, targetId).run();
  if (!result.meta.changes) return apiError(context, 404, "MEMBERSHIP_NOT_FOUND", "This active member was not found.");
  await endContributions(context.env.DB, group.id, targetId, "removed");
  await createNotification(context.env.DB, { groupId: group.id, recipientUserId: targetId, actorUserId: user.id, kind: "member_removed" });
  return context.json({ ok: true } as const);
});

app.post("/api/groups/:groupId/memberships/:userId/regenerate-password", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!; const targetId = context.req.param("userId");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can regenerate passwords.");
  const target = await context.env.DB.prepare("SELECT user_id FROM memberships WHERE group_id = ? AND user_id = ? AND state = 'active'").bind(group.id, targetId).first();
  if (!target) return apiError(context, 404, "MEMBERSHIP_NOT_FOUND", "This active member was not found.");
  const password = temporaryPassword();
  await context.env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?")
    .bind(await hashPassword(password), Date.now(), targetId).run();
  return context.json(temporaryPasswordResponseSchema.parse({ password }));
});

app.get("/api/groups/:groupId/members/:userId", requireGroupAccess, async (context) => {
  const groupId = context.req.param("groupId");
  const targetUserId = context.req.param("userId");
  const [target] = await createDatabase(context.env.DB).select({
    id: users.id,
    state: memberships.state,
    currentDisplayName: users.displayName,
    currentBio: users.bio,
    currentAvatarKey: users.avatarKey,
    snapshotDisplayName: memberships.profileDisplayName,
    snapshotBio: memberships.profileBio,
    snapshotAvatarKey: memberships.profileAvatarKey,
  }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(
    eq(memberships.groupId, groupId),
    eq(memberships.userId, targetUserId),
    inArray(memberships.state, ["active", "left", "removed"]),
  )).limit(1);
  if (!target) return apiError(context, 404, "PROFILE_NOT_FOUND", "This profile is not available in this group.");
  const parsedQuery = feedQuerySchema.omit({ newerThan: true }).safeParse(context.req.query());
  if (!parsedQuery.success) return apiError(context, 400, "INVALID_CURSOR", "The post cursor is invalid.");
  const cursor = decodeCursor(parsedQuery.data.cursor);
  if (parsedQuery.data.cursor && !cursor) return apiError(context, 400, "INVALID_CURSOR", "The post cursor is invalid.");
  const group = context.get("groupAccess");
  const viewer = context.get("user")!;
  const profilePosts = await queryPosts(context.env.DB, {
    groupId, authorId: targetUserId, userId: viewer.id, creatorUserId: group.creatorUserId,
    mediaBase: context.env.PUBLIC_MEDIA_BASE_URL,
    limit: parsedQuery.data.limit, cursor,
  });
  const active = target.state === "active";
  return context.json(profileResponseSchema.parse({
    profile: {
      id: target.id,
      displayName: active ? target.currentDisplayName : target.snapshotDisplayName ?? "Former member",
      bio: active ? target.currentBio : target.snapshotBio,
      avatarUrl: mediaUrl(context.env, active ? target.currentAvatarKey : target.snapshotAvatarKey),
      membership: active ? "active" : "former",
    },
    posts: profilePosts,
  }));
});

app.patch("/api/groups/:groupId/memberships/:userId", requireGroupAccess, async (context) => {
  const user = context.get("user")!;
  const parsed = await parseJson(context, membershipDecisionRequestSchema);
  if ("response" in parsed) return parsed.response;
  const groupId = context.req.param("groupId");
  const group = context.get("groupAccess");
  if (group.creatorUserId !== user.id) return apiError(context, 403, "CREATOR_REQUIRED", "Only the group creator can review requests.");
  const now = Date.now();
  const result = await context.env.DB.prepare(
    "UPDATE memberships SET state = ?, decided_at = ?, " +
    "profile_display_name = CASE WHEN ? = 'active' THEN (SELECT display_name FROM users WHERE id = ?) ELSE profile_display_name END, " +
    "profile_bio = CASE WHEN ? = 'active' THEN (SELECT bio FROM users WHERE id = ?) ELSE profile_bio END, " +
    "profile_avatar_key = CASE WHEN ? = 'active' THEN (SELECT avatar_key FROM users WHERE id = ?) ELSE profile_avatar_key END, " +
    "updated_at = ? WHERE group_id = ? AND user_id = ? AND state = 'pending'",
  ).bind(
    parsed.data.decision === "accept" ? "active" : "rejected", now,
    parsed.data.decision === "accept" ? "active" : "rejected", context.req.param("userId"),
    parsed.data.decision === "accept" ? "active" : "rejected", context.req.param("userId"),
    parsed.data.decision === "accept" ? "active" : "rejected", context.req.param("userId"),
    now, groupId, context.req.param("userId"),
  ).run();
  if (!result.meta.changes) return apiError(context, 404, "REQUEST_NOT_FOUND", "This pending request was not found.");
  await createNotification(context.env.DB, {
    groupId, recipientUserId: context.req.param("userId"), actorUserId: user.id,
    kind: parsed.data.decision === "accept" ? "join_accepted" : "join_rejected", createdAt: now,
  });
  return context.json({ ok: true } as const);
});

app.get("/api/groups/:groupId/courses", requireGroupAccess, async (context) => {
  const parsed = paginationQuerySchema.safeParse(context.req.query());
  const cursor = decodeCursor(parsed.success ? parsed.data.cursor : undefined);
  if (!parsed.success || (parsed.data.cursor && !cursor)) return apiError(context, 400, "INVALID_CURSOR", "The course list cursor is invalid.");
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const clauses = ["c.group_id = ?", `(c.status = 'published' OR c.owner_id = ? OR (c.status = 'archived' AND ? = ?)
    OR (c.status = 'draft' AND EXISTS (SELECT 1 FROM course_contributors cc WHERE cc.course_id = c.id AND cc.user_id = ? AND cc.state = 'active')))`];
  const values: Array<string | number> = [user.id, group.id, user.id, group.creatorUserId, user.id, user.id];
  if (cursor) { clauses.push("(c.created_at < ? OR (c.created_at = ? AND c.id < ?))"); values.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  const rows = await context.env.DB.prepare(`${COURSE_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY c.created_at DESC, c.id DESC LIMIT ?`)
    .bind(...values, parsed.data.limit + 1).all<CourseRow>();
  const page = rows.results.slice(0, parsed.data.limit); const tail = page.at(-1);
  return context.json(coursePageSchema.parse({
    items: page.map((row) => presentCourse(row, user.id, group.creatorUserId, context.env.PUBLIC_MEDIA_BASE_URL)),
    nextCursor: rows.results.length > parsed.data.limit && tail ? encodeCursor({ createdAt: tail.createdAt, id: tail.id }) : null,
  }));
});

app.post("/api/groups/:groupId/courses", requireGroupAccess, async (context) => {
  const parsed = await parseJson(context, createCourseRequestSchema); if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const courseId = crypto.randomUUID(); const now = Date.now();
  await context.env.DB.prepare(
    "INSERT INTO courses (id, group_id, owner_id, title, summary, level, intended_learner, cover_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'draft', ?, ?)",
  ).bind(courseId, group.id, user.id, parsed.data.title, parsed.data.summary, parsed.data.level || null, parsed.data.intendedLearner || null, now, now).run();
  return courseResponse(context, courseId, 201);
});

app.get("/api/groups/:groupId/courses/:courseId", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  // The outline is complete; blocks come only for the first few visible lessons, and later lessons load by ID.
  const outline = await readOutline(context.env.DB, found.row, user.id);
  const lessons = await lessonsWithBlocks(context.env.DB, found.row, user.id, outline.slice(0, COURSE_PRELOADED_LESSONS));
  return context.json(courseDetailResponseSchema.parse({
    course: presentCourse(found.row, user.id, group.creatorUserId, context.env.PUBLIC_MEDIA_BASE_URL), outline: outline.map(presentLessonSummary), lessons,
  }));
});

app.patch("/api/groups/:groupId/courses/:courseId", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const parsed = await parseJson(context, updateCourseRequestSchema); if ("response" in parsed) return parsed.response;
  await context.env.DB.prepare("UPDATE courses SET title = ?, summary = ?, level = ?, intended_learner = ?, updated_at = ? WHERE group_id = ? AND id = ?")
    .bind(parsed.data.title, parsed.data.summary, parsed.data.level || null, parsed.data.intendedLearner || null, Date.now(), found.row.groupId, found.row.id).run();
  return courseResponse(context, found.row.id);
});

app.post("/api/groups/:groupId/courses/:courseId/visibility", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const parsed = await parseJson(context, courseVisibilityRequestSchema); if ("response" in parsed) return parsed.response;
  const now = Date.now();
  const update = context.env.DB.prepare("UPDATE courses SET status = ?, updated_at = ? WHERE group_id = ? AND id = ? AND status != 'archived'")
    .bind(parsed.data.status, now, found.row.groupId, found.row.id);
  if (parsed.data.status !== "published" || found.row.firstPublishedAt !== null) {
    await update.run();
    return courseResponse(context, found.row.id);
  }
  // The first publication announces the course once in the feed. The unique course link and the
  // first_published_at guard keep a concurrent or repeated publish from adding a second post.
  const latest = await context.env.DB.prepare("SELECT MAX(created_at) AS createdAt FROM posts WHERE group_id = ?")
    .bind(found.row.groupId).first<{ createdAt: number | null }>();
  const createdAt = Math.max(now, (latest?.createdAt ?? 0) + 1);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO posts (id, group_id, author_id, type, body, notes, course_id, created_at, updated_at)
       SELECT ?, ?, ?, 'course', '', NULL, ?, ?, ? WHERE EXISTS (SELECT 1 FROM courses WHERE group_id = ? AND id = ? AND first_published_at IS NULL)
       ON CONFLICT(course_id) DO NOTHING`,
    ).bind(crypto.randomUUID(), found.row.groupId, found.row.ownerId, found.row.id, createdAt, createdAt, found.row.groupId, found.row.id),
    context.env.DB.prepare("UPDATE courses SET first_published_at = ? WHERE group_id = ? AND id = ? AND first_published_at IS NULL")
      .bind(now, found.row.groupId, found.row.id),
    update,
  ]);
  return courseResponse(context, found.row.id);
});

app.post("/api/groups/:groupId/courses/:courseId/archive", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  if (found.row.ownerId !== user.id && group.creatorUserId !== user.id) return apiError(context, 403, "COURSE_ARCHIVE_FORBIDDEN", "Only the course owner or group creator can archive this course.");
  await context.env.DB.prepare("UPDATE courses SET status = 'archived', updated_at = ? WHERE group_id = ? AND id = ? AND status != 'archived'")
    .bind(Date.now(), group.id, found.row.id).run();
  return courseResponse(context, found.row.id);
});

app.post("/api/groups/:groupId/courses/:courseId/restore", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  if (found.row.ownerId !== user.id && group.creatorUserId !== user.id) return apiError(context, 403, "COURSE_ARCHIVE_FORBIDDEN", "Only the course owner or group creator can restore this course.");
  if (found.row.status !== "archived") return apiError(context, 409, "COURSE_NOT_ARCHIVED", "This course is not archived.");
  // Restored courses return as drafts so the owner decides again when they are visible.
  await context.env.DB.prepare("UPDATE courses SET status = 'draft', updated_at = ? WHERE group_id = ? AND id = ? AND status = 'archived'")
    .bind(Date.now(), group.id, found.row.id).run();
  return courseResponse(context, found.row.id);
});

app.post("/api/groups/:groupId/courses/:courseId/cover", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const uploaded = await uploadedImage(context, "courses");
  if ("error" in uploaded) return uploaded.error;
  try {
    await context.env.DB.prepare("UPDATE courses SET cover_key = ?, updated_at = ? WHERE group_id = ? AND id = ?").bind(uploaded.key, Date.now(), found.row.groupId, found.row.id).run();
  } catch (error) {
    await context.env.MEDIA.delete(uploaded.key);
    throw error;
  }
  if (found.row.coverKey) await context.env.MEDIA.delete(found.row.coverKey);
  return context.json(imageResponseSchema.parse({ url: mediaUrl(context.env, uploaded.key) }));
});

app.delete("/api/groups/:groupId/courses/:courseId/cover", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  await context.env.DB.prepare("UPDATE courses SET cover_key = NULL, updated_at = ? WHERE group_id = ? AND id = ?").bind(Date.now(), found.row.groupId, found.row.id).run();
  if (found.row.coverKey) await context.env.MEDIA.delete(found.row.coverKey);
  return context.json({ ok: true } as const);
});

// Contributors are listed with their group profile, falling back to the snapshot once they are no longer active members.
app.get("/api/groups/:groupId/courses/:courseId/contributors", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  const owner = found.row.ownerId === context.get("user")!.id;
  const rows = await context.env.DB.prepare(
    `SELECT cc.user_id AS id, cc.state, cc.requested_at AS requestedAt, cc.decided_at AS decidedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN m.state = 'active' THEN u.avatar_key ELSE m.profile_avatar_key END AS avatarKey
     FROM course_contributors cc JOIN users u ON u.id = cc.user_id
     LEFT JOIN memberships m ON m.group_id = cc.group_id AND m.user_id = cc.user_id
     WHERE cc.group_id = ? AND cc.course_id = ? AND cc.state IN (${owner ? "'active', 'pending'" : "'active'"})
     ORDER BY COALESCE(cc.decided_at, cc.requested_at) ASC, cc.user_id ASC`,
  ).bind(found.row.groupId, found.row.id).all<{ id: string; state: "pending" | "active"; requestedAt: number; decidedAt: number | null; displayName: string; avatarKey: string | null }>();
  const items = rows.results.map((row) => ({
    user: { id: row.id, displayName: row.displayName, avatarUrl: mediaUrl(context.env, row.avatarKey) }, state: row.state, requestedAt: row.requestedAt, decidedAt: row.decidedAt,
  }));
  return context.json(courseContributorsResponseSchema.parse({ active: items.filter((item) => item.state === "active"), pending: items.filter((item) => item.state === "pending") }));
});

// Any member who can read a published course may ask to contribute; rejected, departed, and removed members may ask again.
app.post("/api/groups/:groupId/courses/:courseId/contributors", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  const user = context.get("user")!; const course = found.row; const now = Date.now();
  if (course.ownerId === user.id) return apiError(context, 400, "OWNER_CANNOT_CONTRIBUTE", "The course owner already edits this course.");
  if (course.status === "archived") return apiError(context, 409, "COURSE_ARCHIVED", "Restore this course before changing it.");
  const requested = await context.env.DB.prepare(
    `INSERT INTO course_contributors (group_id, course_id, user_id, state, requested_at, decided_at, updated_at) VALUES (?, ?, ?, 'pending', ?, NULL, ?)
     ON CONFLICT(course_id, user_id) DO UPDATE SET state = 'pending', requested_at = excluded.requested_at, decided_at = NULL, updated_at = excluded.updated_at
     WHERE course_contributors.state IN ('rejected', 'left', 'removed')`,
  ).bind(course.groupId, course.id, user.id, now, now).run();
  if (!requested.meta.changes) return apiError(context, 409, "CONTRIBUTION_EXISTS", "You already contribute to this course or have a pending request.");
  await createNotification(context.env.DB, { groupId: course.groupId, recipientUserId: course.ownerId, actorUserId: user.id, kind: "contributor_requested", courseId: course.id, createdAt: now });
  return courseResponse(context, course.id, 201);
});

// Withdrawing a pending request and leaving an active role both end as `left`. This works even once the course is hidden.
app.post("/api/groups/:groupId/courses/:courseId/contributors/leave", requireGroupAccess, async (context) => {
  const group = context.get("groupAccess"); const user = context.get("user")!; const now = Date.now();
  const left = await context.env.DB.prepare("UPDATE course_contributors SET state = 'left', decided_at = ?, updated_at = ? WHERE group_id = ? AND course_id = ? AND user_id = ? AND state IN ('pending', 'active')")
    .bind(now, now, group.id, context.req.param("courseId"), user.id).run();
  if (!left.meta.changes) return apiError(context, 404, "CONTRIBUTION_NOT_FOUND", "You have no contributor role or request for this course.");
  return context.json({ ok: true } as const);
});

app.patch("/api/groups/:groupId/courses/:courseId/contributors/:userId", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const parsed = await parseJson(context, contributorDecisionRequestSchema); if ("response" in parsed) return parsed.response;
  const user = context.get("user")!; const course = found.row; const targetId = context.req.param("userId"); const now = Date.now();
  const accepted = parsed.data.decision === "accept";
  // Only a requester who is still an active group member can be accepted.
  const decided = await context.env.DB.prepare(
    `UPDATE course_contributors SET state = ?, decided_at = ?, updated_at = ? WHERE group_id = ? AND course_id = ? AND user_id = ? AND state = 'pending'
     AND (? = 'rejected' OR EXISTS (SELECT 1 FROM memberships WHERE group_id = ? AND user_id = ? AND state = 'active'))`,
  ).bind(accepted ? "active" : "rejected", now, now, course.groupId, course.id, targetId, accepted ? "active" : "rejected", course.groupId, targetId).run();
  if (!decided.meta.changes) return apiError(context, 404, "CONTRIBUTOR_REQUEST_NOT_FOUND", "This pending request was not found.");
  await createNotification(context.env.DB, {
    groupId: course.groupId, recipientUserId: targetId, actorUserId: user.id, kind: accepted ? "contributor_accepted" : "contributor_rejected", courseId: course.id, createdAt: now,
  });
  return context.json({ ok: true } as const);
});

// Removing a contributor keeps everything they wrote.
app.delete("/api/groups/:groupId/courses/:courseId/contributors/:userId", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const now = Date.now();
  const removed = await context.env.DB.prepare("UPDATE course_contributors SET state = 'removed', decided_at = ?, updated_at = ? WHERE group_id = ? AND course_id = ? AND user_id = ? AND state = 'active'")
    .bind(now, now, found.row.groupId, found.row.id, context.req.param("userId")).run();
  if (!removed.meta.changes) return apiError(context, 404, "CONTRIBUTOR_NOT_FOUND", "This contributor was not found.");
  return context.json({ ok: true } as const);
});

app.post("/api/groups/:groupId/courses/:courseId/lessons", requireGroupAccess, async (context) => {
  const found = await contributableCourse(context); if ("error" in found) return found.error;
  const parsed = await parseJson(context, createLessonRequestSchema); if ("response" in parsed) return parsed.response;
  const user = context.get("user")!; const course = found.row; const lessonId = crypto.randomUUID(); const now = Date.now();
  // Position and the lesson limit are evaluated inside the insert so concurrent saves cannot exceed the limit.
  const inserted = await context.env.DB.prepare(
    `INSERT INTO course_lessons (id, group_id, course_id, title, goal, position, published, version, created_by, updated_by, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM course_lessons WHERE group_id = ? AND course_id = ?), 0, 1, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM course_lessons WHERE group_id = ? AND course_id = ?) < ?`,
  ).bind(lessonId, course.groupId, course.id, parsed.data.title, parsed.data.goal, course.groupId, course.id, user.id, user.id, now, now, course.groupId, course.id, COURSE_LESSONS_MAX).run();
  if (!inserted.meta.changes) return apiError(context, 409, "LESSON_LIMIT_REACHED", "This course already has the maximum number of lessons.");
  return lessonResponse(context, course, lessonId, 201);
});

app.put("/api/groups/:groupId/courses/:courseId/lessons/order", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const reordered = await reorderChildren(context, "course_lessons", "course_id", found.row.id, found.row.groupId); if ("error" in reordered) return reordered.error;
  const outline = await readOutline(context.env.DB, found.row, context.get("user")!.id);
  return context.json(outlineResponseSchema.parse({ outline: outline.map(presentLessonSummary) }));
});

app.get("/api/groups/:groupId/courses/:courseId/lessons/:lessonId", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  return lessonResponse(context, found.row, lesson.lesson.id);
});

// Progress counts finished lessons among the currently published ones, for every active member of the course's group.
// Members are listed by name, never ranked by progress.
async function progressResponse(context: Context<AppEnvironment>, course: CourseRow) {
  const db = context.env.DB; const viewerId = context.get("user")!.id;
  const [published, mine, members] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total FROM course_lessons WHERE group_id = ? AND course_id = ? AND published = 1").bind(course.groupId, course.id).first<{ total: number }>(),
    db.prepare("SELECT lesson_id AS lessonId FROM course_lesson_completions WHERE group_id = ? AND course_id = ? AND user_id = ? ORDER BY completed_at")
      .bind(course.groupId, course.id, viewerId).all<{ lessonId: string }>(),
    db.prepare(
      `SELECT u.id, u.display_name AS displayName, u.avatar_key AS avatarKey,
        (SELECT COUNT(*) FROM course_lesson_completions clc JOIN course_lessons l ON l.id = clc.lesson_id AND l.group_id = clc.group_id AND l.published = 1
          WHERE clc.group_id = m.group_id AND clc.course_id = ? AND clc.user_id = m.user_id) AS completed
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? AND m.state = 'active'
       ORDER BY u.display_name COLLATE NOCASE ASC, u.id ASC`,
    ).bind(course.id, course.groupId).all<{ id: string; displayName: string; avatarKey: string | null; completed: number }>(),
  ]);
  const total = published?.total ?? 0;
  return context.json(courseProgressResponseSchema.parse({
    publishedLessons: total,
    completedLessonIds: mine.results.map((row) => row.lessonId),
    participants: members.results.map((row) => ({
      user: { id: row.id, displayName: row.displayName, avatarUrl: mediaUrl(context.env, row.avatarKey) },
      completedLessons: row.completed, percent: total ? Math.floor((row.completed / total) * 100) : 0,
    })),
  }));
}

app.get("/api/groups/:groupId/courses/:courseId/progress", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  return progressResponse(context, found.row);
});

// Finishing a published lesson in the lesson player records it once; repeating the lesson keeps the first completion time.
app.put("/api/groups/:groupId/courses/:courseId/lessons/:lessonId/completion", requireGroupAccess, async (context) => {
  const found = await visibleCourse(context); if ("error" in found) return found.error;
  if (found.row.status === "archived") return apiError(context, 409, "COURSE_ARCHIVED", "Restore this course before changing it.");
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  if (!lesson.lesson.published) return apiError(context, 409, "LESSON_UNPUBLISHED", "Only published lessons count toward progress.");
  await context.env.DB.prepare(
    `INSERT INTO course_lesson_completions (group_id, course_id, lesson_id, user_id, completed_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (lesson_id, user_id) DO NOTHING`,
  ).bind(found.row.groupId, found.row.id, lesson.lesson.id, context.get("user")!.id, Date.now()).run();
  return progressResponse(context, found.row);
});

app.patch("/api/groups/:groupId/courses/:courseId/lessons/:lessonId", requireGroupAccess, async (context) => {
  const found = await contributableCourse(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  const parsed = await parseJson(context, updateLessonRequestSchema); if ("response" in parsed) return parsed.response;
  const forbidden = contributorEditError(context, found.row, lesson.lesson, parsed.data.published); if (forbidden) return forbidden;
  const updated = await context.env.DB.prepare(
    "UPDATE course_lessons SET title = ?, goal = ?, published = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE group_id = ? AND course_id = ? AND id = ? AND version = ?",
  ).bind(parsed.data.title, parsed.data.goal, parsed.data.published ? 1 : 0, context.get("user")!.id, Date.now(), found.row.groupId, found.row.id, lesson.lesson.id, parsed.data.version).run();
  if (!updated.meta.changes) return versionConflict(context);
  return lessonResponse(context, found.row, lesson.lesson.id);
});

app.delete("/api/groups/:groupId/courses/:courseId/lessons/:lessonId", requireGroupAccess, async (context) => {
  const found = await deletableCourseContent(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  // Lessons and blocks are hard-deleted together with their practice threads; reactions have no foreign key, so they go first.
  const lessonBlocks = "SELECT id FROM course_blocks WHERE group_id = ? AND course_id = ? AND lesson_id = ?";
  await context.env.DB.batch([
    context.env.DB.prepare(`DELETE FROM reactions WHERE group_id = ? AND target_kind = 'comment' AND target_id IN (SELECT id FROM comments WHERE group_id = ? AND block_id IN (${lessonBlocks}))`)
      .bind(found.row.groupId, found.row.groupId, found.row.groupId, found.row.id, lesson.lesson.id),
    context.env.DB.prepare(`DELETE FROM comments WHERE group_id = ? AND block_id IN (${lessonBlocks})`).bind(found.row.groupId, found.row.groupId, found.row.id, lesson.lesson.id),
    context.env.DB.prepare("DELETE FROM course_lesson_completions WHERE group_id = ? AND course_id = ? AND lesson_id = ?").bind(found.row.groupId, found.row.id, lesson.lesson.id),
    context.env.DB.prepare("DELETE FROM course_blocks WHERE group_id = ? AND course_id = ? AND lesson_id = ?").bind(found.row.groupId, found.row.id, lesson.lesson.id),
    context.env.DB.prepare("DELETE FROM course_lessons WHERE group_id = ? AND course_id = ? AND id = ?").bind(found.row.groupId, found.row.id, lesson.lesson.id),
  ]);
  return context.json({ ok: true } as const);
});

app.post("/api/groups/:groupId/courses/:courseId/lessons/:lessonId/blocks", requireGroupAccess, async (context) => {
  const found = await contributableCourse(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  const parsed = await parseJson(context, createBlockRequestSchema); if ("response" in parsed) return parsed.response;
  // Contributors may add unpublished blocks to any lesson they can see, including a published one.
  const forbidden = contributorEditError(context, found.row, null, parsed.data.published); if (forbidden) return forbidden;
  const user = context.get("user")!; const course = found.row; const blockId = crypto.randomUUID(); const now = Date.now();
  const inserted = await context.env.DB.prepare(
    `INSERT INTO course_blocks (id, group_id, course_id, lesson_id, position, kind, payload, payload_version, published, version, created_by, updated_by, created_at, updated_at)
     SELECT ?, ?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM course_blocks WHERE group_id = ? AND lesson_id = ?), ?, ?, ?, ?, 1, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM course_blocks WHERE group_id = ? AND lesson_id = ?) < ?`,
  ).bind(
    blockId, course.groupId, course.id, lesson.lesson.id, course.groupId, lesson.lesson.id, parsed.data.kind, JSON.stringify(parsed.data.payload), COURSE_BLOCK_PAYLOAD_VERSION,
    parsed.data.published ? 1 : 0, user.id, user.id, now, now, course.groupId, lesson.lesson.id, COURSE_BLOCKS_MAX,
  ).run();
  if (!inserted.meta.changes) return apiError(context, 409, "BLOCK_LIMIT_REACHED", "This lesson already has the maximum number of blocks.");
  return blockResponse(context, course, lesson.lesson.id, blockId, 201);
});

app.put("/api/groups/:groupId/courses/:courseId/lessons/:lessonId/blocks/order", requireGroupAccess, async (context) => {
  const found = await editableCourse(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  const reordered = await reorderChildren(context, "course_blocks", "lesson_id", lesson.lesson.id, found.row.groupId); if ("error" in reordered) return reordered.error;
  return lessonResponse(context, found.row, lesson.lesson.id);
});

app.patch("/api/groups/:groupId/courses/:courseId/lessons/:lessonId/blocks/:blockId", requireGroupAccess, async (context) => {
  const found = await contributableCourse(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  const block = await visibleBlock(context, found.row, lesson.lesson); if ("error" in block) return block.error;
  const parsed = await parseJson(context, updateBlockRequestSchema); if ("response" in parsed) return parsed.response;
  const forbidden = contributorEditError(context, found.row, block.block, parsed.data.published); if (forbidden) return forbidden;
  if (parsed.data.kind !== block.block.kind) return apiError(context, 400, "BLOCK_KIND_IMMUTABLE", "A block keeps its kind. Add a new block instead.");
  const updated = await context.env.DB.prepare(
    `UPDATE course_blocks SET payload = ?, payload_version = ?, published = ?, version = version + 1, updated_by = ?, updated_at = ?
     WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND id = ? AND version = ?`,
  ).bind(
    JSON.stringify(parsed.data.payload), COURSE_BLOCK_PAYLOAD_VERSION, parsed.data.published ? 1 : 0, context.get("user")!.id, Date.now(),
    found.row.groupId, found.row.id, lesson.lesson.id, block.block.id, parsed.data.version,
  ).run();
  if (!updated.meta.changes) return versionConflict(context);
  return blockResponse(context, found.row, lesson.lesson.id, block.block.id);
});

app.delete("/api/groups/:groupId/courses/:courseId/lessons/:lessonId/blocks/:blockId", requireGroupAccess, async (context) => {
  const found = await deletableCourseContent(context); if ("error" in found) return found.error;
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return lesson.error;
  const block = await visibleBlock(context, found.row, lesson.lesson); if ("error" in block) return block.error;
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM reactions WHERE group_id = ? AND target_kind = 'comment' AND target_id IN (SELECT id FROM comments WHERE group_id = ? AND block_id = ?)")
      .bind(found.row.groupId, found.row.groupId, block.block.id),
    context.env.DB.prepare("DELETE FROM comments WHERE group_id = ? AND block_id = ?").bind(found.row.groupId, block.block.id),
    context.env.DB.prepare("DELETE FROM course_blocks WHERE group_id = ? AND course_id = ? AND lesson_id = ? AND id = ?").bind(found.row.groupId, found.row.id, lesson.lesson.id, block.block.id),
  ]);
  return context.json({ ok: true } as const);
});

// Resolves a visible practice block for its answer thread. Writes are refused while the course is archived.
async function practiceBlock(context: Context<AppEnvironment>, write: boolean) {
  const found = await visibleCourse(context); if ("error" in found) return { error: found.error };
  if (write && found.row.status === "archived") return { error: apiError(context, 409, "COURSE_ARCHIVED", "Restore this course before changing it.") };
  const lesson = await visibleLesson(context, found.row); if ("error" in lesson) return { error: lesson.error };
  const block = await visibleBlock(context, found.row, lesson.lesson); if ("error" in block) return { error: block.error };
  const content = storedBlockContent(block.block);
  if (content.kind !== "practice") return { error: apiError(context, 404, "PRACTICE_NOT_FOUND", "This practice is not available.") };
  return { course: found.row, block: block.block, practice: content.payload, target: { column: "block_id", id: block.block.id } satisfies DiscussionTarget };
}

async function practiceThreadItem(context: Context<AppEnvironment>, target: DiscussionTarget, commentId: string) {
  const user = context.get("user")!; const group = context.get("groupAccess");
  return (await readDiscussion(context.env.DB, group.id, target, user.id, group.creatorUserId, null))
    .flatMap((entry) => [entry, ...entry.replies]).find((entry) => entry.id === commentId)!;
}

// Each response item snapshots its prompt so the answer set stays readable after the practice is edited. Nothing is matched.
function practiceResponseStatements(binding: D1Database, commentId: string, prompts: string[], answers: string[]) {
  if (answers.length !== prompts.length) return null;
  return prompts.map((prompt, position) => {
    const answer = answers[position]?.trim() ?? "";
    return binding.prepare("INSERT INTO comment_response_items (comment_id, position, prompt, answer, skipped, matched) VALUES (?, ?, ?, ?, ?, NULL)")
      .bind(commentId, position, prompt, answer, answer ? 0 : 1);
  });
}

const practicePath = "/api/groups/:groupId/courses/:courseId/lessons/:lessonId/blocks/:blockId";

// The thread, together with the author's version and item notes, is fetched only when the reader reveals it.
app.get(`${practicePath}/discussion`, requireGroupAccess, async (context) => {
  const found = await practiceBlock(context, false); if ("error" in found) return found.error;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const [items, account] = await Promise.all([
    readDiscussion(context.env.DB, group.id, found.target, user.id, group.creatorUserId, null),
    context.env.DB.prepare("SELECT quick_reaction_one AS one, quick_reaction_two AS two, quick_reaction_three AS three FROM users WHERE id = ?")
      .bind(user.id).first<{ one: string; two: string; three: string }>(),
  ]);
  return context.json(practiceDiscussionResponseSchema.parse({
    items, count: items.reduce((total, item) => total + 1 + item.replies.length, 0),
    quickReactions: [account!.one, account!.two, account!.three], reference: splitPracticePayload(found.practice).reference,
  }));
});

app.post(`${practicePath}/comments`, requireGroupAccess, async (context) => {
  const found = await practiceBlock(context, true); if ("error" in found) return found.error;
  const parsed = await parseJson(context, createPracticeCommentRequestSchema); if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  let parentId: string | null = null;
  if (parsed.data.kind === "text") {
    if (!parsed.data.parentId) return apiError(context, 400, "INVALID_RESPONSE_KIND", "Answer every item in one answer set.");
    const parent = await context.env.DB.prepare("SELECT id, parent_comment_id AS parentId FROM comments WHERE group_id = ? AND block_id = ? AND id = ?")
      .bind(group.id, found.block.id, parsed.data.parentId).first<{ id: string; parentId: string | null }>();
    if (!parent || parent.parentId) return apiError(context, 400, "INVALID_PARENT", "Replies can only be added to a top-level answer in this practice.");
    parentId = parent.id;
  }
  const commentId = crypto.randomUUID(); const now = Date.now();
  const children = parsed.data.kind === "practice_response"
    ? practiceResponseStatements(context.env.DB, commentId, found.practice.items.map((item) => item.prompt), parsed.data.answers) : [];
  if (children === null) return apiError(context, 400, "ANSWER_COUNT_MISMATCH", "Answer every prompt, leaving a blank response when needed.");
  await context.env.DB.batch([
    context.env.DB.prepare("INSERT INTO comments (id, group_id, post_id, block_id, author_id, parent_comment_id, kind, body, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)")
      .bind(commentId, group.id, found.block.id, user.id, parentId, parsed.data.kind, parsed.data.kind === "text" ? parsed.data.body.trim() : null, now, now),
    ...children,
  ]);
  return context.json(commentResponseSchema.parse({ item: await practiceThreadItem(context, found.target, commentId) }), 201);
});

app.patch(`${practicePath}/comments/:commentId`, requireGroupAccess, async (context) => {
  const found = await practiceBlock(context, true); if ("error" in found) return found.error;
  const parsed = await parseJson(context, updatePracticeCommentRequestSchema); if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!; const commentId = context.req.param("commentId");
  const existing = await context.env.DB.prepare("SELECT author_id AS authorId, kind, created_at AS createdAt FROM comments WHERE group_id = ? AND block_id = ? AND id = ?")
    .bind(group.id, found.block.id, commentId).first<{ authorId: string; kind: DiscussionItem["kind"]; createdAt: number }>();
  if (!existing) return apiError(context, 404, "COMMENT_NOT_FOUND", "This response is not available.");
  if (existing.authorId !== user.id) return apiError(context, 403, "COMMENT_EDIT_FORBIDDEN", "Only the author can edit this response.");
  if (existing.kind !== parsed.data.kind) return apiError(context, 400, "INVALID_RESPONSE_KIND", "The response type cannot be changed.");
  let children: D1PreparedStatement[] | null = [];
  if (parsed.data.kind === "practice_response") {
    // Edits keep the prompts the answer set was written against, even if the practice has changed since.
    const snapshots = await context.env.DB.prepare("SELECT prompt FROM comment_response_items WHERE comment_id = ? ORDER BY position ASC").bind(commentId).all<{ prompt: string | null }>();
    children = practiceResponseStatements(context.env.DB, commentId, snapshots.results.map((row) => row.prompt ?? ""), parsed.data.answers);
  }
  if (children === null) return apiError(context, 400, "ANSWER_COUNT_MISMATCH", "Answer every prompt, leaving a blank response when needed.");
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM comment_response_items WHERE comment_id = ?").bind(commentId),
    context.env.DB.prepare("UPDATE comments SET body = ?, updated_at = ? WHERE group_id = ? AND block_id = ? AND id = ?")
      .bind(parsed.data.kind === "text" ? parsed.data.body.trim() : null, Math.max(Date.now(), existing.createdAt + 1), group.id, found.block.id, commentId),
    ...children,
  ]);
  return context.json(commentResponseSchema.parse({ item: await practiceThreadItem(context, found.target, commentId) }));
});

app.delete(`${practicePath}/comments/:commentId`, requireGroupAccess, async (context) => {
  const found = await practiceBlock(context, true); if ("error" in found) return found.error;
  const group = context.get("groupAccess"); const user = context.get("user")!; const commentId = context.req.param("commentId");
  const existing = await context.env.DB.prepare("SELECT author_id AS authorId FROM comments WHERE group_id = ? AND block_id = ? AND id = ?")
    .bind(group.id, found.block.id, commentId).first<{ authorId: string }>();
  if (!existing) return apiError(context, 404, "COMMENT_NOT_FOUND", "This response is not available.");
  if (existing.authorId !== user.id && group.creatorUserId !== user.id) return apiError(context, 403, "COMMENT_DELETE_FORBIDDEN", "You cannot delete this response.");
  await context.env.DB.batch([
    context.env.DB.prepare("DELETE FROM reactions WHERE group_id = ? AND target_kind = 'comment' AND (target_id = ? OR target_id IN (SELECT id FROM comments WHERE group_id = ? AND parent_comment_id = ?))")
      .bind(group.id, commentId, group.id, commentId),
    context.env.DB.prepare("DELETE FROM comments WHERE group_id = ? AND block_id = ? AND (id = ? OR parent_comment_id = ?)").bind(group.id, found.block.id, commentId, commentId),
  ]);
  return context.json({ ok: true } as const);
});

app.put(`${practicePath}/comments/:commentId/reactions`, requireGroupAccess, async (context) => {
  const found = await practiceBlock(context, true); if ("error" in found) return found.error;
  return toggleReaction(context, "comment", context.req.param("commentId"), found.target);
});

app.notFound((context) => apiError(context, 404, "NOT_FOUND", "The requested resource was not found."));
app.onError((error, context) => {
  logError("request.failed", {
    requestId: context.get("requestId"),
    method: context.req.method,
    route: routePath(context, -1) || "unmatched",
    status: 500,
    errorCode: "INTERNAL_ERROR",
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    errorCause: error.cause instanceof Error ? `${error.cause.name}: ${error.cause.message}` : undefined,
  });
  return context.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId: context.get("requestId") } }, 500);
});
