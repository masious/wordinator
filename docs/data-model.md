# Data model

This is a conceptual relational model, not final migration syntax. The Drizzle schema and migrations must preserve these constraints.

## Identity and groups

### `users`

Opaque ID, normalized unique email, password hash and parameters, display name, optional bio/avatar key, three quick-reaction emoji, `must_change_password`, and timestamps. There is no account-deletion state initially.

### `groups`

Opaque ID, creator user ID, name, immutable language code (`nl` or `de` initially), optional icon key, invitation token/hash, creation/update timestamps, and nullable `deleted_at`.

### `memberships`

Group/user pair, lifecycle state, timestamps, and enough state to restore memberships active at group deletion. Enforce one row per group/user. The group’s creator has an active membership but creator authority is owned by `groups.creator_user_id`.

Memberships also keep the last group-visible display name, bio, and avatar key. Active account profile edits refresh these fields. Former-member reads use the snapshot instead of current account fields, preventing a group from observing profile changes made after departure.

Join request decisions and membership transitions should retain the facts needed for the restricted status experience. This may be captured in membership timestamps/state or a small transition/event table; do not create duplicate pending requests.

## Posts

### `posts`

Opaque ID, group ID, author ID, type, primary body, optional notes, nullable course ID, created/updated timestamps, and edited state derived from timestamps or stored explicitly. The primary body is sentence, question, paragraph, or fill prompt according to type. A check constraint limits type to `shared_sentence`, `question`, `reading`, `fill_in`, and `course`.

A `course` post is system-created on a course's first publication. Its body is empty and its course ID links the course; a check constraint requires a course ID exactly when the type is `course`, and a unique index on course ID allows at most one post per course. Course reads use the live course row. Migration `0012_course_feed_posts.sql` rebuilds `posts` for the course link and type, restoring reading questions, expected answers, comments, response items, and pins from constraint-free copies.

### `reading_questions`

Post ID, stable question ID, zero-based/one-based position, and question text. Unique position within a reading post.

### `fill_expected_answers`

Post ID, blank position, and nullable/optional expected text. The number of recognized `…` tokens is validated against configured answers.

Phase 3 persists these tables in migration `0005_phase_three_posts.sql`. Expected-answer rows are sent back only to their post author for editing; later answer matching remains server-side so ordinary post reads do not disclose them.

## Courses

The [courses blueprint](courses.md) owns course behavior.

### `courses`

Opaque ID, group ID, owner ID, title, summary, optional level, optional intended learner, optional cover key, status (`draft`, `published`, or `archived`), nullable first-published timestamp, and created/updated timestamps. The first-published timestamp is set once, together with the course post, and keeps later publications from creating another post. Migration `0012_course_feed_posts.sql` adds it and backfills it for courses that were already published, which therefore receive no retroactive post. A check constraint limits status to those three values. Owner display uses the live or group snapshot profile at read time, like post authors.

Migration `0009_course_shell.sql` adds the table and its library index.

### `course_lessons`

Opaque ID, group ID, course ID, title, optional goal, position, published flag, integer version (starting at 1), created-by and updated-by user IDs, and created/updated timestamps. Lesson numbers shown to readers are derived from position among the visible lessons and are never stored.

### `course_blocks`

Opaque ID, group ID, course ID, lesson ID, position, kind, JSON payload, payload version, published flag, integer version, created-by and updated-by user IDs, and created/updated timestamps. A check constraint limits kind to `heading`, `text`, `example`, `dialogue`, and `practice`, and another requires the payload to be valid JSON. The shared contracts own each kind's payload shape; the API stores the current payload version and reads stored payloads through the contracts' versioned parser.

Every content edit increments `version`; reordering rewrites only `position`. Updated-by display uses the live or group snapshot profile at read time and is shown to the owner and contributors as editor attribution. Migration `0010_course_lessons_blocks.sql` adds both tables, which carry an explicit `group_id` and cascade from their course and lesson. Migration `0011_course_practice_threads.sql` rebuilds `course_blocks` to add `practice` to the kind constraint.

### `course_lesson_words`

Added in C8. A derived index of the words in each lesson's published document, so the [course word recap](courses.md#word-recap) never parses documents at read time. Group ID, course ID, lesson ID, block ID, word ID, position (document order within the lesson), term, meaning, and optional forms, example, and note. The primary key is `(lesson_id, word_id)`. The published document stays the source of truth: publishing replaces the lesson's rows from the new published document in the same D1 batch, unpublishing deletes them, and rows cascade from their course and lesson. Indexed by `(group_id, course_id, lesson_id, position)`.

### `course_contributors`

Group ID, course ID, user ID, state (`pending`, `active`, `rejected`, `left`, or `removed`), requested timestamp, nullable decided timestamp, and updated timestamp. The primary key is `(course_id, user_id)`: like a membership, each member has one row per course whose state changes, so there is at most one pending request. A new request reuses a `rejected`, `left`, or `removed` row. A check constraint limits the states. Rows cascade from their course, and leaving or being removed from the group moves that member's `pending` and `active` rows in the group to `left` or `removed`. Contributor display uses the live or group snapshot profile at read time. Migration `0013_course_contributors.sql` adds the table and its `(group_id, course_id, state)` index.

### `course_lesson_completions`

Group ID, course ID, lesson ID, user ID, and completed timestamp. The primary key is `(lesson_id, user_id)`: a member finishes a lesson once, and repeating it keeps the first timestamp. Rows cascade from their course and lesson, and lesson deletion also removes them explicitly in its batch. No percentage is stored; [course progress](courses.md#lesson-player-and-progress) is derived at read time over the currently published lessons. Rows stay when a member leaves the group. Migration `0014_course_lesson_completions.sql` adds the table and its `(group_id, course_id, user_id)` index.

A practice payload stores the instruction, an optional passage, and ordered items with a prompt, an author's version list (empty when there is none), and an optional note. Authors' versions and notes are stored in the payload but removed from every learner read; see [courses](courses.md#practice-answers).

## Discussion

### `comments`

Opaque ID, group ID, nullable post ID, nullable course block ID, author ID, nullable parent comment ID, plain body where applicable, created/updated timestamps, and a kind: `text`, `reading_response`, `fill_response`, or `practice_response`. A check constraint requires exactly one of post ID and block ID, so every comment belongs to one discussion target: a post or a practice block. Parent comments must belong to the same target and themselves have no parent. Comments are indexed by `(group_id, post_id, parent_comment_id, created_at, id)` and `(group_id, block_id, parent_comment_id, created_at, id)`.

Migration `0011_course_practice_threads.sql` rebuilds `comments` with the block target and the new kind. Because dropping a parent table can fire cascades, the migration restores comments, response items, and pins from constraint-free copies after the rebuild.

### `comment_response_items`

For structured reading, fill, and practice answers: comment ID, ordered position, optional prompt/question snapshot, answer text, skipped flag, and optional positive-match result. Snapshots preserve understandable historical answers if an author later edits questions or prompts. Practice answer sets always snapshot each item prompt and never store a match result.

### Post pin

Store a nullable pinned top-level comment ID on the post or in a uniquely constrained pin table. Validate that the post is answer-oriented and the comment belongs to it. Only one pin exists per post.

Migration `0006_phase_four_discussions.sql` persists `comments`, `comment_response_items`, `post_pins`, and `reactions`. Discussion and response rows cascade from post/comment deletion. Because reaction targets are polymorphic, mutations validate target ownership explicitly and post/comment deletion explicitly removes affected reaction rows.

Migration `0007_phase_five_media.sql` adds nullable `groups.icon_key`. Existing avatar keys, profile snapshots, lifecycle states, and `groups.deleted_at` support the remainder of Phase 5. Active memberships are intentionally not rewritten during group soft deletion; `deleted_at` is the reversible access gate.

## Reactions

### `reactions`

User ID, target kind, target ID, normalized emoji grapheme, group ID, and timestamp. A unique constraint on `(user_id, target_kind, target_id, emoji)` enforces one count per emoji per item. The target and actor must share the group.

Polymorphic targets require explicit application validation and cascade cleanup. Separate reaction tables are acceptable if they make relational integrity materially safer.

## Notifications

### `notifications`

Opaque ID, group ID, recipient ID, actor ID, event type, optional post ID, optional comment ID, optional course ID, read timestamp, and creation timestamp. Event types are `join_requested`, `join_accepted`, `join_rejected`, `member_removed`, `post_response`, `reply`, `answer_pinned`, `reaction`, `contributor_requested`, `contributor_accepted`, and `contributor_rejected`; only contributor events carry a course ID. Actor display uses the live or group snapshot profile at read time. Post, comment, and course IDs intentionally have no foreign key so notifications survive target deletion. Migration `0013_course_contributors.sql` rebuilds the table to add the contributor event types and the course ID. Never store credentials, tokens, or complete content bodies in notification metadata.

## Deletion and retention

- Groups are soft-deleted through `deleted_at`; all group records remain recoverable.
- Posts are hard-deleted with questions, expected answers, comments, response items, reactions, and pins.
- Comments are hard-deleted with replies, response items, and reactions.
- Notifications survive target deletion.
- Courses are never hard-deleted. Archiving sets status `archived`; restoring returns the course to `draft` so the owner chooses again when to publish. Archived courses keep their cover image. A course post stays when its course is archived and is deleted like any other post.
- Lessons and blocks are hard-deleted. Deleting a lesson deletes its blocks in the same batch. Deleting a block, or a lesson containing it, also deletes its practice answers, replies, response items, and the reactions on them. Comments cascade from their block, and the API deletes the reactions and comments explicitly in the same batch because reaction targets have no foreign key.
- Member departure never deletes authored content or reactions. Contributor departure or removal keeps their lessons, blocks, and updated-by attribution. Lesson completions also stay and are hidden while the member is not active.
- Deleting a lesson deletes its completions.
- Records and images otherwise remain indefinitely.
- Replaced/removed R2 images are deleted after database state safely points away from them.

## Indexing and isolation

Index the feed by `(group_id, created_at, id)`, memberships by user and state, pending membership requests by group/state, profile posts by `(group_id, author_id, created_at, id)`, comments by post/parent/order and by block/parent/order, reactions by target, the course library by `(group_id, created_at, id)`, lessons by `(group_id, course_id, position)`, blocks by `(group_id, lesson_id, position)`, course contributors by `(group_id, course_id, state)`, lesson completions by `(group_id, course_id, user_id)`, and notifications by `(recipient_id, group_id, created_at)` plus `(recipient_id, created_at)` for restricted status lookup.

Every tenant-owned table includes or can unambiguously derive `group_id`. Favor explicit `group_id` when it makes authorization and indexes safer, even if technically redundant.
