import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    username: text("username"),
    onboardingCompletedAt: integer("onboarding_completed_at"),
    bio: text("bio"),
    avatarKey: text("avatar_key"),
    quickReactionOne: text("quick_reaction_one").notNull().default("👍"),
    quickReactionTwo: text("quick_reaction_two").notNull().default("❤️"),
    quickReactionThree: text("quick_reaction_three").notNull().default("😂"),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("users_normalized_email_unique").on(table.normalizedEmail),
    uniqueIndex("users_username_unique").on(table.username),
  ],
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
    type: text("type", { enum: ["shared_sentence", "question", "reading", "fill_in", "course"] }).notNull(),
    body: text("body").notNull(),
    notes: text("notes"),
    // Set only on the system-created post announcing a course's first publication.
    courseId: text("course_id").references(() => courses.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("posts_group_feed_idx").on(table.groupId, table.createdAt, table.id),
    index("posts_group_author_idx").on(table.groupId, table.authorId, table.createdAt, table.id),
    uniqueIndex("posts_course_unique").on(table.courseId),
    check("posts_type_check", sql`${table.type} in ('shared_sentence', 'question', 'reading', 'fill_in', 'course')`),
    check("posts_course_link_check", sql`(${table.type} = 'course') = (${table.courseId} IS NOT NULL)`),
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

// A comment belongs to exactly one discussion target: a post or a course practice, identified by its practice block ID.
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
    blockId: text("block_id").references(() => coursePractices.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    parentCommentId: text("parent_comment_id"),
    kind: text("kind", { enum: ["text", "reading_response", "fill_response", "practice_response"] }).notNull(),
    body: text("body"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("comments_group_post_parent_idx").on(table.groupId, table.postId, table.parentCommentId, table.createdAt, table.id),
    index("comments_group_block_parent_idx").on(table.groupId, table.blockId, table.parentCommentId, table.createdAt, table.id),
    check("comments_kind_check", sql`${table.kind} in ('text', 'reading_response', 'fill_response', 'practice_response')`),
    check("comments_target_check", sql`(${table.postId} IS NULL) <> (${table.blockId} IS NULL)`),
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
    kind: text("kind", { enum: ["join_requested", "join_accepted", "join_rejected", "member_removed", "post_response", "reply", "answer_pinned", "reaction", "contributor_requested", "contributor_accepted", "contributor_rejected"] }).notNull(),
    postId: text("post_id"),
    commentId: text("comment_id"),
    // Set only on contributor notifications, which link to the course rather than a post.
    courseId: text("course_id"),
    createdAt: integer("created_at").notNull(),
    readAt: integer("read_at"),
  },
  (table) => [
    index("notifications_recipient_group_created_idx").on(table.recipientUserId, table.groupId, table.createdAt),
    index("notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
    check("notifications_kind_check", sql`${table.kind} in ('join_requested', 'join_accepted', 'join_rejected', 'member_removed', 'post_response', 'reply', 'answer_pinned', 'reaction', 'contributor_requested', 'contributor_accepted', 'contributor_rejected')`),
  ],
);

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    ownerId: text("owner_id").notNull().references(() => users.id),
    // Readable URL segment, assigned once from the title (docs/courses.md#readable-urls). Every write sets it;
    // the column is nullable only because SQLite cannot add a NOT NULL column without a default.
    slug: text("slug"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    level: text("level"),
    intendedLearner: text("intended_learner"),
    coverKey: text("cover_key"),
    // The dialogue cast as a JSON map from speaker label to voice (docs/speech.md#dialogue-cast); null when there is none.
    speechCast: text("speech_cast"),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull(),
    firstPublishedAt: integer("first_published_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("courses_group_library_idx").on(table.groupId, table.createdAt, table.id),
    uniqueIndex("courses_group_slug_unique").on(table.groupId, table.slug),
    check("courses_status_check", sql`${table.status} in ('draft', 'published', 'archived')`),
    check("courses_speech_cast_check", sql`${table.speechCast} IS NULL OR json_valid(${table.speechCast})`),
  ],
);

// A lesson stores one draft and one published lesson document (`@wordinator/contracts/lesson-document`) as JSON text.
// A lesson without a published document is unpublished.
export const courseLessons = sqliteTable(
  "course_lessons",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    // Readable URL segment, unique within the course; see `courses.slug`.
    slug: text("slug"),
    title: text("title").notNull(),
    goal: text("goal"),
    position: integer("position").notNull(),
    draftDoc: text("draft_doc").notNull().default('{"schemaVersion":2,"blocks":[]}'),
    draftVersion: integer("draft_version").notNull().default(1),
    publishedDoc: text("published_doc"),
    publishedAt: integer("published_at"),
    createdBy: text("created_by").notNull().references(() => users.id),
    updatedBy: text("updated_by").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("course_lessons_course_position_idx").on(table.groupId, table.courseId, table.position),
    uniqueIndex("course_lessons_course_slug_unique").on(table.courseId, table.slug),
    check("course_lessons_draft_doc_check", sql`json_valid(${table.draftDoc})`),
    check("course_lessons_published_doc_check", sql`${table.publishedDoc} IS NULL OR json_valid(${table.publishedDoc})`),
  ],
);

// One anchor per practice block ID in either document of a lesson, so practice answer threads keep a foreign key.
export const coursePractices = sqliteTable(
  "course_practices",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("course_practices_lesson_idx").on(table.groupId, table.lessonId)],
);

// Every uploaded lesson image. Documents store the R2 key; rows unreferenced by both documents are cleaned up.
export const courseMedia = sqliteTable(
  "course_media",
  {
    key: text("key").primaryKey(),
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("course_media_lesson_idx").on(table.groupId, table.lessonId, table.createdAt)],
);

// Per-course contributor roles mirror the membership lifecycle; one row per member and course.
export const courseContributors = sqliteTable(
  "course_contributors",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    state: text("state", { enum: ["pending", "active", "rejected", "left", "removed"] }).notNull(),
    requestedAt: integer("requested_at").notNull(),
    decidedAt: integer("decided_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.courseId, table.userId] }),
    index("course_contributors_course_state_idx").on(table.groupId, table.courseId, table.state),
    check("course_contributors_state_check", sql`${table.state} in ('pending', 'active', 'rejected', 'left', 'removed')`),
  ],
);

// A member's finished lessons; course progress is derived from these rows over the currently published lessons.
export const courseLessonCompletions = sqliteTable(
  "course_lesson_completions",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    completedAt: integer("completed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.userId] }),
    index("course_lesson_completions_course_idx").on(table.groupId, table.courseId, table.userId),
  ],
);

// How many questions of a practice a member has answered. Only the count is stored; the answers stay in the member's local draft.
// A practice is done when the count reaches its current number of questions.
export const coursePracticeProgress = sqliteTable(
  "course_practice_progress",
  {
    practiceId: text("practice_id").notNull().references(() => coursePractices.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    answered: integer("answered").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.practiceId, table.userId] }),
    index("course_practice_progress_lesson_idx").on(table.groupId, table.lessonId),
    check("course_practice_progress_answered_check", sql`${table.answered} >= 0`),
  ],
);

// A member's last step in a lesson they have not finished. The furthest share passed feeds course progress; finishing clears the row.
export const courseLessonPositions = sqliteTable(
  "course_lesson_positions",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    stepKey: text("step_key").notNull(),
    stepIndex: integer("step_index").notNull(),
    passedSteps: integer("passed_steps").notNull(),
    totalSteps: integer("total_steps").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.userId] }),
    index("course_lesson_positions_course_idx").on(table.groupId, table.courseId, table.userId),
    check("course_lesson_positions_steps_check", sql`${table.totalSteps} > 0 AND ${table.passedSteps} BETWEEN 0 AND ${table.totalSteps} - 1 AND ${table.stepIndex} BETWEEN 0 AND ${table.totalSteps} - 1`),
  ],
);

// Derived from the published lesson document on publish; see docs/data-model.md#course_lesson_words.
export const courseLessonWords = sqliteTable(
  "course_lesson_words",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    blockId: text("block_id").notNull(),
    wordId: text("word_id").notNull(),
    position: integer("position").notNull(),
    term: text("term").notNull(),
    meaning: text("meaning").notNull(),
    forms: text("forms"),
    example: text("example"),
    note: text("note"),
    ipa: text("ipa"),
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.wordId] }),
    index("course_lesson_words_lesson_idx").on(table.groupId, table.courseId, table.lessonId, table.position),
  ],
);

// Word bookmarks (C9b): keys into `course_lesson_words`, deliberately without a foreign key to it (see the migration).
export const courseWordBookmarks = sqliteTable(
  "course_word_bookmarks",
  {
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    wordId: text("word_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.lessonId, table.wordId] }),
    index("course_word_bookmarks_user_idx").on(table.groupId, table.userId, table.createdAt),
  ],
);

// Lesson speech (C10a): one row per synthesized clip, shared across groups; see docs/data-model.md#speech_clips.
export const speechClips = sqliteTable(
  "speech_clips",
  {
    hash: text("hash").primaryKey(),
    voice: text("voice").notNull(),
    characters: integer("characters").notNull(),
    status: text("status", { enum: ["pending", "ready", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at"),
    claimedAt: integer("claimed_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [check("speech_clips_status_check", sql`${table.status} in ('pending', 'ready', 'failed')`)],
);

// At most one pending speech job per lesson; see docs/data-model.md#speech_jobs.
export const speechJobs = sqliteTable(
  "speech_jobs",
  {
    lessonId: text("lesson_id").primaryKey().references(() => courseLessons.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull().references(() => groups.id),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    dueAt: integer("due_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("speech_jobs_due_idx").on(table.dueAt)],
);
