import {
  accountSettingsResponseSchema,
  changePasswordRequestSchema,
  commentResponseSchema,
  createCommentRequestSchema,
  createPostRequestSchema,
  feedQuerySchema,
  createGroupRequestSchema,
  healthResponseSchema,
  imageResponseSchema,
  memberDirectoryResponseSchema,
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
  type DiscussionItem,
  type Post,
  type PostInput,
} from "@wordinator/contracts";
import { createDatabase, groups, memberships, users } from "@wordinator/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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
const FALLBACK_HASH = "pbkdf2_sha256$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
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

async function uploadedImage(context: Context<AppEnvironment>, prefix: "avatars" | "groups") {
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
};
type ReactionRow = { targetId: string; emoji: string; userId: string; displayName: string };
type NotificationKind = "join_requested" | "join_accepted" | "join_rejected" | "member_removed" | "post_response" | "reply" | "answer_pinned" | "reaction";

function notificationStatement(binding: D1Database, input: {
  groupId: string; recipientUserId: string; actorUserId: string; kind: NotificationKind; postId?: string | null; commentId?: string | null; createdAt?: number;
}) {
  return binding.prepare(
    "INSERT INTO notifications (id, group_id, recipient_user_id, actor_user_id, kind, post_id, comment_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(crypto.randomUUID(), input.groupId, input.recipientUserId, input.actorUserId, input.kind, input.postId ?? null, input.commentId ?? null, input.createdAt ?? Date.now());
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
      n.kind, n.post_id AS postId, n.comment_id AS commentId, n.created_at AS createdAt, n.read_at AS readAt,
      CASE WHEN n.post_id IS NULL THEN 1 WHEN p.id IS NULL THEN 0 WHEN n.comment_id IS NOT NULL AND c.id IS NULL THEN 0 ELSE 1 END AS targetAvailable
     FROM notifications n JOIN groups g ON g.id = n.group_id JOIN users actor ON actor.id = n.actor_user_id
     LEFT JOIN memberships am ON am.group_id = n.group_id AND am.user_id = n.actor_user_id
     LEFT JOIN posts p ON p.group_id = n.group_id AND p.id = n.post_id
     LEFT JOIN comments c ON c.group_id = n.group_id AND c.post_id = n.post_id AND c.id = n.comment_id
     WHERE ${filters.join(" AND ")} ORDER BY n.created_at DESC, n.id DESC`,
  ).bind(...values).all<{ id: string; groupId: string; groupName: string; actorId: string; actorDisplayName: string; kind: NotificationKind; postId: string | null; commentId: string | null; createdAt: number; readAt: number | null; targetAvailable: number }>();
  return rows.results.map((row) => ({
    id: row.id, groupId: row.groupId, groupName: row.groupName,
    actor: { id: row.actorId, displayName: row.actorDisplayName }, kind: row.kind,
    postId: row.postId, commentId: row.commentId, targetAvailable: Boolean(row.targetAvailable),
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
    id: row.id, groupId: row.groupId, type: row.type, body: row.body, notes: row.notes,
    author: { id: row.authorId, displayName: row.displayName, avatarUrl: mediaUrlFromBase(mediaBase, row.avatarKey) },
    createdAt: row.createdAt, updatedAt: row.updatedAt, edited: row.updatedAt > row.createdAt,
    questions: questions.results.filter((question) => question.postId === row.id).map(({ id, position, text }) => ({ id, position, text })),
    expectedAnswers: row.authorId === userId
      ? expectedAnswers.results.filter((answer) => answer.postId === row.id).map(({ position, text }) => ({ position, text }))
      : [],
    commentCount: commentCounts.results.find((count) => count.postId === row.id)?.count ?? 0,
    reactionCount: reactions.results.filter((reaction) => reaction.targetId === row.id).length,
    reactions: groupReactions(reactions.results, row.id, userId),
    permissions: { edit: row.authorId === userId, delete: row.authorId === userId || creatorUserId === userId },
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
    `SELECT p.id, p.group_id AS groupId, p.author_id AS authorId, p.type, p.body, p.notes,
      p.created_at AS createdAt, p.updated_at AS updatedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN m.state = 'active' THEN u.avatar_key ELSE m.profile_avatar_key END AS avatarKey
     FROM posts p JOIN users u ON u.id = p.author_id
     LEFT JOIN memberships m ON m.group_id = p.group_id AND m.user_id = p.author_id
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
    `SELECT p.id, p.group_id AS groupId, p.author_id AS authorId, p.type, p.body, p.notes,
      p.created_at AS createdAt, p.updated_at AS updatedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN m.state = 'active' THEN u.avatar_key ELSE m.profile_avatar_key END AS avatarKey
     FROM posts p JOIN users u ON u.id = p.author_id
     LEFT JOIN memberships m ON m.group_id = p.group_id AND m.user_id = p.author_id
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
  id: string; postId: string; authorId: string; parentId: string | null; kind: DiscussionItem["kind"];
  body: string | null; createdAt: number; updatedAt: number; displayName: string; pinned: number;
};

async function readDiscussion(binding: D1Database, groupId: string, postId: string, viewerId: string, creatorUserId: string, postAuthorId: string) {
  const rows = await binding.prepare(
    `SELECT c.id, c.post_id AS postId, c.author_id AS authorId, c.parent_comment_id AS parentId, c.kind, c.body,
      c.created_at AS createdAt, c.updated_at AS updatedAt,
      CASE WHEN m.state = 'active' THEN u.display_name ELSE COALESCE(m.profile_display_name, 'Former member') END AS displayName,
      CASE WHEN pin.comment_id = c.id THEN 1 ELSE 0 END AS pinned
     FROM comments c JOIN users u ON u.id = c.author_id
     LEFT JOIN memberships m ON m.group_id = c.group_id AND m.user_id = c.author_id
     LEFT JOIN post_pins pin ON pin.post_id = c.post_id
     WHERE c.group_id = ? AND c.post_id = ?
     ORDER BY CASE WHEN c.parent_comment_id IS NULL AND pin.comment_id = c.id THEN 0 ELSE 1 END, c.created_at ASC, c.id ASC`,
  ).bind(groupId, postId).all<CommentRow>();
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
    permissions: { edit: row.authorId === viewerId, delete: row.authorId === viewerId || creatorUserId === viewerId, reply: row.parentId === null, pin: row.parentId === null && (postAuthorId === viewerId || creatorUserId === viewerId) },
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

async function toggleReaction(context: Context<AppEnvironment>, targetKind: "post" | "comment", targetId: string, postId?: string) {
  const parsed = await parseJson(context, toggleReactionRequestSchema); if ("response" in parsed) return parsed.response;
  const group = context.get("groupAccess"); const user = context.get("user")!;
  const target = targetKind === "post"
    ? await context.env.DB.prepare("SELECT id, author_id AS authorId FROM posts WHERE group_id = ? AND id = ?").bind(group.id, targetId).first<{ id: string; authorId: string }>()
    : await context.env.DB.prepare("SELECT id, author_id AS authorId FROM comments WHERE group_id = ? AND post_id = ? AND id = ?").bind(group.id, postId, targetId).first<{ id: string; authorId: string }>();
  if (!target) return apiError(context, 404, targetKind === "post" ? "POST_NOT_FOUND" : "COMMENT_NOT_FOUND", "This content is not available.");
  if (parsed.data.active) {
    const result = await context.env.DB.prepare(
    "INSERT INTO reactions (group_id, user_id, target_kind, target_id, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, target_kind, target_id, emoji) DO NOTHING",
    ).bind(group.id, user.id, targetKind, targetId, parsed.data.emoji.normalize("NFC"), Date.now()).run();
    if (result.meta.changes) await createNotification(context.env.DB, { groupId: group.id, recipientUserId: target.authorId, actorUserId: user.id, kind: "reaction", postId: targetKind === "post" ? targetId : postId, commentId: targetKind === "comment" ? targetId : null });
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
  if (!key || (!key.startsWith("avatars/") && !key.startsWith("groups/"))) return apiError(context, 404, "IMAGE_NOT_FOUND", "This image is not available.");
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
    logError('user not found in context')
    return context.json({ status: "signedOut" } as const);
  }
  logError('user found!')
  const database = createDatabase(context.env.DB);
  const activeGroups = await database
    .select({ id: groups.id, name: groups.name, language: groups.language, creatorUserId: groups.creatorUserId, iconKey: groups.iconKey })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.userId, user.id), eq(memberships.state, "active"), isNull(groups.deletedAt)))
    .orderBy(asc(groups.name));
    logError("active groups fi")
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
    user,
    groups: activeGroups.map((group) => ({
      id: group.id, name: group.name, language: group.language,
      role: group.creatorUserId === user.id ? "creator" as const : "member" as const,
      icon: group.language === "nl" ? "🇳🇱" : "🇩🇪",
      iconUrl: mediaUrl(context.env, group.iconKey),
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
    return apiError(context, 401, "INVALID_CREDENTIALS", "Email or password is incorrect." + account?.email);
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
  const pendingMembers = group.creatorUserId === user.id
    ? await database.select({ userId: users.id, displayName: users.displayName, requestedAt: memberships.requestedAt })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.groupId, groupId), eq(memberships.state, "pending"))).orderBy(asc(memberships.requestedAt))
    : [];
  return context.json({
    group: {
      id: group.id, name: group.name, language: group.language,
      role: group.creatorUserId === user.id ? "creator" as const : "member" as const,
      icon: group.language === "nl" ? "🇳🇱" : "🇩🇪",
      iconUrl: mediaUrl(context.env, group.iconKey),
    },
    invitationToken: group.invitationToken,
    pendingMembers,
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
    createdAt: now, updatedAt: now, displayName: user.displayName, avatarKey: accountMedia?.avatarKey ?? null,
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
    "SELECT author_id AS authorId, created_at AS createdAt FROM posts WHERE group_id = ? AND id = ?",
  ).bind(group.id, context.req.param("postId")).first<{ authorId: string; createdAt: number }>();
  if (!existing) return apiError(context, 404, "POST_NOT_FOUND", "This post is not available.");
  if (existing.authorId !== user.id) return apiError(context, 403, "POST_EDIT_FORBIDDEN", "Only the author can edit this post.");
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
    readDiscussion(context.env.DB, group.id, post.id, user.id, group.creatorUserId, post.authorId),
    context.env.DB.prepare("SELECT quick_reaction_one AS one, quick_reaction_two AS two, quick_reaction_three AS three FROM users WHERE id = ?")
      .bind(user.id).first<{ one: string; two: string; three: string }>(),
  ]);
  return context.json(discussionResponseSchema.parse({
    items, count: items.reduce((count, item) => count + 1 + item.replies.length, 0),
    concealed: post.type !== "shared_sentence", quickReactions: [account!.one, account!.two, account!.three],
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
  const item = (await readDiscussion(context.env.DB, group.id, postId, user.id, group.creatorUserId, post.authorId))
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
  const item = (await readDiscussion(context.env.DB, group.id, postId, user.id, group.creatorUserId, existing.postAuthorId))
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
  if (post.type === "shared_sentence") return apiError(context, 400, "PIN_UNAVAILABLE", "Comments on shared sentences cannot be pinned.");
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
  return toggleReaction(context, "comment", context.req.param("commentId"), context.req.param("postId"));
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
    permissions: { manageMembers: viewer.id === group.creatorUserId, leave: viewer.id !== group.creatorUserId },
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
