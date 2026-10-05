import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const platformMetadata = sqliteTable("platform_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    normalizedEmail: text("normalized_email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarKey: text("avatar_key"),
    quickReactionOne: text("quick_reaction_one").notNull().default("👍"),
    quickReactionTwo: text("quick_reaction_two").notNull().default("❤️"),
    quickReactionThree: text("quick_reaction_three").notNull().default("😂"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail)],
);

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    creatorUserId: text("creator_user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    language: text("language", { enum: ["nl", "de"] }).notNull(),
    iconKey: text("icon_key"),
    invitationToken: text("invitation_token").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [
    uniqueIndex("groups_invitation_token_unique").on(table.invitationToken),
    index("groups_creator_idx").on(table.creatorUserId),
    check("groups_language_check", sql`${table.language} in ('nl', 'de')`),
  ],
);

export const memberships = sqliteTable(
  "memberships",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    userId: text("user_id").notNull().references(() => users.id),
    state: text("state", { enum: ["pending", "active", "rejected", "left", "removed"] }).notNull(),
    requestedAt: integer("requested_at").notNull(),
    decidedAt: integer("decided_at"),
    profileDisplayName: text("profile_display_name"),
    profileBio: text("profile_bio"),
    profileAvatarKey: text("profile_avatar_key"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("memberships_group_user_unique").on(table.groupId, table.userId),
    index("memberships_group_state_idx").on(table.groupId, table.state),
    index("memberships_user_state_idx").on(table.userId, table.state),
    check("memberships_state_check", sql`${table.state} in ('pending', 'active', 'rejected', 'left', 'removed')`),
  ],
);

export const loginAttempts = sqliteTable(
  "login_attempts",
  {
    key: text("key").primaryKey(),
    failures: integer("failures").notNull(),
    windowStartedAt: integer("window_started_at").notNull(),
    blockedUntil: integer("blocked_until"),
  },
  (table) => [index("login_attempts_blocked_until_idx").on(table.blockedUntil)],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    authorId: text("author_id").notNull().references(() => users.id),
    type: text("type", { enum: ["shared_sentence", "question", "reading", "fill_in"] }).notNull(),
    body: text("body").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("posts_group_feed_idx").on(table.groupId, table.createdAt, table.id),
    index("posts_group_author_idx").on(table.groupId, table.authorId, table.createdAt, table.id),
    check("posts_type_check", sql`${table.type} in ('shared_sentence', 'question', 'reading', 'fill_in')`),
  ],
);

export const readingQuestions = sqliteTable(
  "reading_questions",
  {
    id: text("id").primaryKey(),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
  },
  (table) => [uniqueIndex("reading_questions_post_position_unique").on(table.postId, table.position)],
);

export const fillExpectedAnswers = sqliteTable(
  "fill_expected_answers",
  {
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text"),
  },
  (table) => [uniqueIndex("fill_expected_answers_post_position_unique").on(table.postId, table.position)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    parentCommentId: text("parent_comment_id"),
    kind: text("kind", { enum: ["text", "reading_response", "fill_response"] }).notNull(),
    body: text("body"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("comments_group_post_parent_idx").on(table.groupId, table.postId, table.parentCommentId, table.createdAt, table.id),
    check("comments_kind_check", sql`${table.kind} in ('text', 'reading_response', 'fill_response')`),
  ],
);

export const commentResponseItems = sqliteTable(
  "comment_response_items",
  {
    commentId: text("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    prompt: text("prompt"),
    answer: text("answer").notNull(),
    skipped: integer("skipped", { mode: "boolean" }).notNull(),
    matched: integer("matched", { mode: "boolean" }),
  },
  (table) => [uniqueIndex("comment_response_items_comment_position_unique").on(table.commentId, table.position)],
);

export const postPins = sqliteTable("post_pins", {
  postId: text("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
  commentId: text("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  pinnedByUserId: text("pinned_by_user_id").notNull().references(() => users.id),
  createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("post_pins_comment_unique").on(table.commentId)]);

export const reactions = sqliteTable(
  "reactions",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    userId: text("user_id").notNull().references(() => users.id),
    targetKind: text("target_kind", { enum: ["post", "comment"] }).notNull(),
    targetId: text("target_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("reactions_actor_target_emoji_unique").on(table.userId, table.targetKind, table.targetId, table.emoji),
    index("reactions_group_target_idx").on(table.groupId, table.targetKind, table.targetId),
    check("reactions_target_kind_check", sql`${table.targetKind} in ('post', 'comment')`),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    recipientUserId: text("recipient_user_id").notNull().references(() => users.id),
    actorUserId: text("actor_user_id").notNull().references(() => users.id),
    kind: text("kind", { enum: ["join_requested", "join_accepted", "join_rejected", "member_removed", "post_response", "reply", "answer_pinned", "reaction"] }).notNull(),
    postId: text("post_id"),
    commentId: text("comment_id"),
    createdAt: integer("created_at").notNull(),
    readAt: integer("read_at"),
  },
  (table) => [
    index("notifications_recipient_group_created_idx").on(table.recipientUserId, table.groupId, table.createdAt),
    index("notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
    check("notifications_kind_check", sql`${table.kind} in ('join_requested', 'join_accepted', 'join_rejected', 'member_removed', 'post_response', 'reply', 'answer_pinned', 'reaction')`),
  ],
);
