import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    // C14e: set only by the operator command (docs/operations.md#superuser-command).
    isSuperuser: integer("is_superuser", { mode: "boolean" }).notNull().default(false),
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
    type: text("type", { enum: ["shared_sentence", "question", "reading", "fill_in", "course", "lesson_share"] }).notNull(),
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
    check("posts_type_check", sql`${table.type} in ('shared_sentence', 'question', 'reading', 'fill_in', 'course', 'lesson_share')`),
    check("posts_course_link_check", sql`(${table.type} = 'course') = (${table.courseId} IS NOT NULL)`),
  ],
);

// A lesson share post's source (docs/lesson-shares.md, docs/data-model.md#post_lesson_shares). Examples and questions keep a JSON
// snapshot that follows the contracts' schema for their kind; a dialogue has none and is read from the published document.
export const postLessonShares = sqliteTable(
  "post_lesson_shares",
  {
    postId: text("post_id").primaryKey().references(() => posts.id, { onDelete: "cascade" }),
    groupId: text("group_id").notNull().references(() => groups.id),
    authorId: text("author_id").notNull().references(() => users.id),
    kind: text("kind", { enum: ["example", "dialogue", "question"] }).notNull(),
    courseId: text("course_id").notNull().references(() => courses.id),
    // Cleared when the lesson is deleted; the snapshot and the saved titles remain.
    lessonId: text("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
    blockId: text("block_id").notNull(),
    // The question's position at share time; questions only.
    itemIndex: integer("item_index"),
    // The contracts' `lessonShareKey`: one share per person and piece.
    shareKey: text("share_key").notNull(),
    snapshot: text("snapshot"),
    courseTitle: text("course_title").notNull(),
    lessonTitle: text("lesson_title").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("post_lesson_shares_author_key_unique").on(table.authorId, table.shareKey),
    index("post_lesson_shares_author_lesson_idx").on(table.authorId, table.lessonId),
    index("post_lesson_shares_lesson_idx").on(table.lessonId),
    check("post_lesson_shares_kind_check", sql`${table.kind} in ('example', 'dialogue', 'question')`),
    check("post_lesson_shares_item_check", sql`(${table.kind} = 'question') = (${table.itemIndex} IS NOT NULL)`),
    check("post_lesson_shares_snapshot_check", sql`(${table.kind} = 'dialogue') = (${table.snapshot} IS NULL) AND (${table.snapshot} IS NULL OR json_valid(${table.snapshot}))`),
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
    // Word search keys (migration 0023); NULL until written on publish or filled by the search endpoint.
    termKey: text("term_key"),
    searchKey: text("search_key"),
  },
  (table) => [
    primaryKey({ columns: [table.lessonId, table.wordId] }),
    index("course_lesson_words_lesson_idx").on(table.groupId, table.courseId, table.lessonId, table.position),
    index("course_lesson_words_unkeyed_idx").on(table.lessonId).where(sql`${table.termKey} IS NULL OR ${table.searchKey} IS NULL`),
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

// Learning data (C14a, migration 0026): every row belongs to one user and none has `group_id` (storage compatibility rule).
// Lesson and word IDs are keys into `course_lesson_words` without a foreign key to it, like bookmarks; conversation IDs have
// no foreign key either. See docs/data-model.md#learning-data. Migration 0026 seeded the first two from C12's dropped
// `course_word_drill_states`.
export const wordReviews = sqliteTable(
  "word_reviews",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    termKey: text("term_key").notNull(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    wordId: text("word_id").notNull(),
    direction: text("direction", { enum: ["understand", "produce"] }).notNull(),
    result: text("result", { enum: ["got", "again"] }).notNull(),
    source: text("source", { enum: ["drill", "ai_chat", "ai_practice", "seed"] }).notNull(),
    // The C12 Leitner box of a `seed` review, so a rebuild reproduces its seeded stability; null for every other source.
    seedBox: integer("seed_box"),
    conversationId: text("conversation_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("word_reviews_term_idx").on(table.userId, table.termKey, table.direction, table.createdAt),
    index("word_reviews_user_lesson_idx").on(table.userId, table.lessonId),
    index("word_reviews_lesson_idx").on(table.lessonId),
    check("word_reviews_direction_check", sql`${table.direction} in ('understand', 'produce')`),
    check("word_reviews_result_check", sql`${table.result} in ('got', 'again')`),
    check("word_reviews_source_check", sql`${table.source} in ('drill', 'ai_chat', 'ai_practice', 'seed')`),
    check("word_reviews_seed_box_check", sql`(${table.source} = 'seed') = (${table.seedBox} IS NOT NULL) AND (${table.seedBox} IS NULL OR ${table.seedBox} BETWEEN 1 AND 5)`),
  ],
);

export const wordMemory = sqliteTable(
  "word_memory",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    termKey: text("term_key").notNull(),
    direction: text("direction", { enum: ["understand", "produce"] }).notNull(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    wordId: text("word_id").notNull(),
    recent: text("recent").notNull(),
    reps: integer("reps").notNull(),
    lapses: integer("lapses").notNull(),
    lastLapseAt: integer("last_lapse_at"),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    lastReviewedAt: integer("last_reviewed_at").notNull(),
    knownOverride: integer("known_override", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.termKey, table.direction] }),
    index("word_memory_user_reviewed_idx").on(table.userId, table.lastReviewedAt),
    check("word_memory_direction_check", sql`${table.direction} in ('understand', 'produce')`),
    check("word_memory_recent_check", sql`length(${table.recent}) <= 10 AND ${table.recent} NOT GLOB '*[^ga]*'`),
    check("word_memory_difficulty_check", sql`${table.difficulty} BETWEEN 1 AND 10`),
    check("word_memory_known_check", sql`${table.knownOverride} in (0, 1)`),
  ],
);

export const practiceAttempts = sqliteTable(
  "practice_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => courseLessons.id, { onDelete: "cascade" }),
    practiceKind: text("practice_kind", { enum: ["lesson", "ai"] }).notNull(),
    practiceId: text("practice_id").notNull(),
    itemIndex: integer("item_index").notNull(),
    prompt: text("prompt").notNull(),
    answer: text("answer").notNull(),
    reference: text("reference"),
    matched: integer("matched", { mode: "boolean" }),
    aiVerdict: text("ai_verdict", { enum: ["acceptable", "error"] }),
    aiNote: text("ai_note"),
    source: text("source", { enum: ["lesson", "ai_chat", "ai_practice"] }).notNull(),
    conversationId: text("conversation_id"),
    // Word hints the learner opened before answering a tutor component or AI practice (0 for lesson practices).
    hintsUsed: integer("hints_used").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("practice_attempts_user_created_idx").on(table.userId, table.createdAt),
    index("practice_attempts_user_lesson_idx").on(table.userId, table.lessonId),
    check("practice_attempts_kind_check", sql`${table.practiceKind} in ('lesson', 'ai')`),
    check("practice_attempts_source_check", sql`${table.source} in ('lesson', 'ai_chat', 'ai_practice')`),
    check("practice_attempts_verdict_check", sql`${table.aiVerdict} IS NULL OR ${table.aiVerdict} in ('acceptable', 'error')`),
    check("practice_attempts_matched_check", sql`${table.matched} IS NULL OR ${table.matched} in (0, 1)`),
    check("practice_attempts_item_check", sql`${table.itemIndex} >= 0`),
    check("practice_attempts_hints_check", sql`${table.hintsUsed} >= 0 AND ${table.hintsUsed} <= 4`),
    check("practice_attempts_length_check", sql`length(${table.prompt}) <= 2000 AND length(${table.answer}) <= 2000 AND (${table.reference} IS NULL OR length(${table.reference}) <= 2000)`),
  ],
);

// Pronunciation attempts outlive their lesson: lesson deletion sets the lesson and word IDs to null.
export const pronunciationAttempts = sqliteTable(
  "pronunciation_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    surface: text("surface", { enum: ["drill", "word_card", "ai_chat"] }).notNull(),
    referenceText: text("reference_text").notNull(),
    termKey: text("term_key"),
    lessonId: text("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
    wordId: text("word_id"),
    overall: real("overall").notNull(),
    accuracy: real("accuracy").notNull(),
    fluency: real("fluency").notNull(),
    completeness: real("completeness").notNull(),
    wordScores: text("word_scores").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("pronunciation_attempts_user_created_idx").on(table.userId, table.createdAt),
    index("pronunciation_attempts_user_term_idx").on(table.userId, table.termKey),
    check("pronunciation_attempts_surface_check", sql`${table.surface} in ('drill', 'word_card', 'ai_chat')`),
    check(
      "pronunciation_attempts_score_check",
      sql`${table.overall} BETWEEN 0 AND 100 AND ${table.accuracy} BETWEEN 0 AND 100 AND ${table.fluency} BETWEEN 0 AND 100 AND ${table.completeness} BETWEEN 0 AND 100`,
    ),
  ],
);

// Audit only, never read to undo. Course and lesson IDs carry no foreign key, so the audit outlives a deleted lesson.
export const progressEvents = sqliteTable(
  "progress_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    actor: text("actor", { enum: ["user", "agent"] }).notNull(),
    kind: text("kind", { enum: ["lesson_completed", "lesson_reset"] }).notNull(),
    courseId: text("course_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    conversationId: text("conversation_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("progress_events_user_created_idx").on(table.userId, table.createdAt),
    check("progress_events_actor_check", sql`${table.actor} in ('user', 'agent')`),
    check("progress_events_kind_check", sql`${table.kind} in ('lesson_completed', 'lesson_reset')`),
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

// AI tutor metering (C14f): one row per model request, successful or not; see docs/data-model.md#ai_usage. No prompt or
// answer text. `turnStart` marks the first request of a tutor turn, which the daily turn cap counts.
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    conversationId: text("conversation_id"),
    provider: text("provider", { enum: ["openrouter", "workers_ai", "azure"] }).notNull(),
    model: text("model").notNull(),
    turnStart: integer("turn_start", { mode: "boolean" }).notNull().default(false),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costMicroUsd: integer("cost_microusd").notNull().default(0),
    ok: integer("ok", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ai_usage_user_created_idx").on(table.userId, table.createdAt),
    index("ai_usage_created_idx").on(table.createdAt),
    index("ai_usage_conversation_idx").on(table.conversationId),
    check("ai_usage_provider_check", sql`${table.provider} in ('openrouter', 'workers_ai', 'azure')`),
  ],
);

// On-demand speech metering (C14f): one row per request, cache hits included; see docs/data-model.md#speech_usage. No text.
export const speechUsage = sqliteTable(
  "speech_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    surface: text("surface", { enum: ["ai_message", "ai_practice"] }).notNull(),
    clipHash: text("clip_hash").notNull(),
    characters: integer("characters").notNull(),
    cached: integer("cached", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("speech_usage_user_created_idx").on(table.userId, table.createdAt),
    index("speech_usage_created_idx").on(table.createdAt),
    check("speech_usage_surface_check", sql`${table.surface} in ('ai_message', 'ai_practice')`),
  ],
);

// AI tutor (C14g): conversations, their messages, and tutor profiles; see docs/data-model.md#ai-tutor. Conversations are never
// deleted. Message parts are JSON text validated by the contracts' `tutor` subpath.
export const aiConversations = sqliteTable(
  "ai_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    titleSource: text("title_source", { enum: ["auto", "tutor", "user"] }).notNull().default("auto"),
    archivedAt: integer("archived_at"),
    provider: text("provider", { enum: ["openrouter", "workers_ai", "azure"] }),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("ai_conversations_user_archived_updated_idx").on(table.userId, table.archivedAt, table.updatedAt),
    check("ai_conversations_provider_check", sql`${table.provider} is null or ${table.provider} in ('openrouter', 'workers_ai', 'azure')`),
    check("ai_conversations_title_source_check", sql`${table.titleSource} in ('auto', 'tutor', 'user')`),
  ],
);

export const aiMessages = sqliteTable(
  "ai_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    parts: text("parts").notNull(),
    status: text("status", { enum: ["complete", "awaiting_user", "error"] }).notNull(),
    provider: text("provider"),
    model: text("model"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("ai_messages_conversation_created_idx").on(table.conversationId, table.createdAt, table.id),
    check("ai_messages_role_check", sql`${table.role} in ('user', 'assistant')`),
    check("ai_messages_status_check", sql`${table.status} in ('complete', 'awaiting_user', 'error')`),
  ],
);

export const learnerProfiles = sqliteTable(
  "learner_profiles",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    nativeLanguage: text("native_language").notNull().default("en"),
    replyLanguage: text("reply_language", { enum: ["native", "target", "mixed"] }).notNull().default("native"),
    goals: text("goals"),
    tutorNotes: text("tutor_notes"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [check("learner_profiles_reply_language_check", sql`${table.replyLanguage} in ('native', 'target', 'mixed')`)],
);

// AI practices (C14h): practices the tutor saved with the learner's confirmation and the lessons they are tagged to; see
// docs/data-model.md#ai_practices. The payload is JSON text validated by the contracts' `tutor` subpath, reference included.
export const aiPractices = sqliteTable(
  "ai_practices",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["fill_in", "translate", "word_order", "article", "choice", "dictation", "fix_mistake"] }).notNull(),
    payload: text("payload").notNull(),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    check("ai_practices_kind_check", sql`${table.kind} in ('fill_in', 'translate', 'word_order', 'article', 'choice', 'dictation', 'fix_mistake')`),
  ],
);

// One tag per lesson: the block of the lesson's published document the practice follows and its position among practices
// sharing that anchor. Lesson deletion removes the lesson's tags and deletes practices left without tags in its batch.
export const aiPracticeLessons = sqliteTable(
  "ai_practice_lessons",
  {
    practiceId: text("practice_id").notNull().references(() => aiPractices.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull().references(() => courseLessons.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    afterBlockId: text("after_block_id").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.practiceId, table.lessonId] }),
    index("ai_practice_lessons_lesson_anchor_idx").on(table.lessonId, table.afterBlockId, table.position),
    index("ai_practice_lessons_course_idx").on(table.courseId),
    check("ai_practice_lessons_position_check", sql`${table.position} >= 0`),
  ],
);
