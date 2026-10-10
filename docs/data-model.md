# Data model

This is a conceptual relational model, not final migration syntax. The Drizzle schema and migrations must preserve these constraints.

## Global-library migration state

The product model is now accounts → courses → lessons, with one course library for the installation. `groups`, `memberships`, and `group_id` columns are legacy storage compatibility, not product tenancy. They remain temporarily so existing lesson documents, R2 media ownership, course progress, word bookmarks, and speech jobs are preserved during rollout. New features must not create or switch libraries, use invitation state, or grant behavior from membership lifecycle state.

## Identity and groups

### `users`

Opaque ID, normalized unique email, password hash and parameters, case-insensitively unique nullable username, onboarding-completed timestamp, display name, optional bio/avatar key, three quick-reaction emoji, `must_change_password`, and timestamps. New registrations keep username and onboarding completion null until required setup; existing accounts are backfilled by migration `0020_global_accounts.sql`. There is no account-deletion state initially.

### Legacy `groups`

Opaque ID, creator user ID, name, immutable language code (`nl` or `de` initially), optional icon key, invitation token/hash, creation/update timestamps, and nullable `deleted_at`.

### Legacy `memberships`

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

Opaque ID, readable slug (unique per library record, never changed; see [readable URLs](courses.md#readable-urls)), group ID, owner ID, title, summary, optional level, optional intended learner, optional cover key, status (`draft`, `published`, or `archived`), nullable first-published timestamp, and created/updated timestamps. The first-published timestamp is set once, together with the course post, and keeps later publications from creating another post. Migration `0012_course_feed_posts.sql` adds it and backfills it for courses that were already published, which therefore receive no retroactive post. A check constraint limits status to those three values. Owner display uses the live or group snapshot profile at read time, like post authors.

Migration `0009_course_shell.sql` adds the table and its library index.

Added in C10a (migration `0019_speech.sql`): a nullable `speech_cast` JSON column holding the course's [dialogue cast](speech.md#dialogue-cast), a map from trimmed speaker label to voice; null when there is none. A check constraint requires valid JSON.

### `course_lessons`

Opaque ID, readable slug (unique within the course, never changed), group ID, course ID, title, optional goal, position, draft document (JSON text, not null), integer draft version (starting at 1), nullable published document (JSON text), nullable published timestamp, created-by and updated-by user IDs, and created/updated timestamps. Check constraints require both documents to be valid JSON. A lesson is published exactly when its published document is not null. Lesson numbers shown to readers are derived from position among the visible lessons and are never stored.

The shared contracts own the [lesson document](courses.md#lesson-documents) shape, and the API reads stored documents through the contracts' parser. Every draft save increments the draft version. Publishing copies the draft to the published document, discarding copies the published document back into the draft (also incrementing the draft version, so open editors see a conflict), and unpublishing clears the published document. Title and goal edits and reordering do not change the draft version. Updated-by display uses the live or group snapshot profile at read time and is shown to the owner and contributors as editor attribution.

A practice block in a document carries its payload as a JSON string: the instruction, an optional passage, and ordered items with a prompt, an author's version list (empty when there is none), and an optional note. Authors' versions and notes are stored in the documents but removed from every learner read; see [courses](courses.md#practice-answers).

Migration `0010_course_lessons_blocks.sql` added lessons with per-row `course_blocks`, and `0011_course_practice_threads.sql` added the practice kind. Migration `0015_lesson_documents.sql` alters `course_lessons` in place (it is never rebuilt, because completions, practices, and media cascade from it), maps each lesson's blocks into a draft document and its published blocks into a published document exactly as the contracts' `upgradeLegacyBlocks` does, and drops `course_blocks` together with the old published flag and version columns.

### `course_practices`

Opaque ID (the practice block's ID in the document), group ID, course ID, lesson ID, and created timestamp. One anchor row per practice block ID found in either document of a lesson, so practice progress keeps a real foreign key while the practice itself lives in JSON. Draft saves add anchors for new practice IDs and refuse IDs that belong to another lesson; publishing and discarding delete anchors, with their progress, whose practice is in neither document. Rows cascade from their course and lesson. Migration `0015_lesson_documents.sql` adds the table, its `(group_id, lesson_id)` index, and an anchor for every existing practice block.

### `course_practice_progress`

Practice ID, group ID, course ID, lesson ID, user ID, answered count, and updated timestamp, with primary key `(practice_id, user_id)` and an index on `(group_id, lesson_id)`. It records only how many questions of a [practice](courses.md#practice-answers) a learner has answered, never the answers, and saving keeps the highest count. Rows cascade from their practice anchor, course, and lesson. Migration `0022_course_practice_progress.sql` adds the table, turns each shared practice answer set into its author's row (the most items answered in any one set), and deletes every practice comment, its replies, response items, and reactions.

### `course_media`

R2 key (primary key), group ID, course ID, lesson ID, created-by user ID, and created timestamp. Every uploaded [lesson image](courses.md#images) has a row, so the API accepts only image keys uploaded to that lesson. Rows referenced by neither document and older than 24 hours are deleted with their R2 objects at publish and discard and by the daily sweep. Rows cascade from their course and lesson. Migration `0015_lesson_documents.sql` adds the table and its `(group_id, lesson_id, created_at)` index.

### `course_lesson_words`

Added in C8. A derived index of the words in each lesson's published document, so the [course word recap](courses.md#word-recap) never parses documents at read time. Group ID, course ID, lesson ID, block ID, word ID, position (document order within the lesson), term, meaning, and optional forms, example, and note. The primary key is `(lesson_id, word_id)`. The published document stays the source of truth: publishing replaces the lesson's rows from the new published document in the same D1 batch, unpublishing deletes them, lesson deletion also removes them explicitly in its batch, and rows cascade from their course and lesson. Text is stored trimmed, with empty optional fields as null. Indexed by `(group_id, course_id, lesson_id, position)`. Migration `0017_course_lesson_words.sql` adds the table empty, since no published document held vocabulary before it. Migration `0019_speech.sql` adds an optional `ipa` column carrying the word's [pronunciation override](speech.md#pronunciation-override), filled from the next publish of each lesson; reads use it to identify the term's clip and never return it.

### `course_word_bookmarks`

Added in C9b; see [bookmarks](words.md#bookmarks). Group ID, course ID, lesson ID, word ID, user ID, and created timestamp. The primary key is `(user_id, lesson_id, word_id)`. The row is a key only: word text is read from [`course_lesson_words`](#course_lesson_words) at read time, and there is deliberately no foreign key to that table, because publishing replaces a lesson's word rows and would cascade bookmarks away. A bookmark whose word is not in the index is hidden, not deleted. Rows cascade from their course and lesson, lesson deletion also removes them explicitly in its batch, and they stay when a member leaves the group. Indexed by `(group_id, user_id, created_at)`. Migration `0018_course_word_bookmarks.sql` adds the table.

### `course_contributors`

Group ID, course ID, user ID, state (`pending`, `active`, `rejected`, `left`, or `removed`), requested timestamp, nullable decided timestamp, and updated timestamp. The primary key is `(course_id, user_id)`: like a membership, each member has one row per course whose state changes, so there is at most one pending request. A new request reuses a `rejected`, `left`, or `removed` row. A check constraint limits the states. Rows cascade from their course, and leaving or being removed from the group moves that member's `pending` and `active` rows in the group to `left` or `removed`. Contributor display uses the live or group snapshot profile at read time. Migration `0013_course_contributors.sql` adds the table and its `(group_id, course_id, state)` index.

### `course_lesson_completions`

Group ID, course ID, lesson ID, user ID, and completed timestamp. The primary key is `(lesson_id, user_id)`: a member finishes a lesson once, and repeating it keeps the first timestamp. Rows cascade from their course and lesson, and lesson deletion also removes them explicitly in its batch. No percentage is stored; [course progress](courses.md#lesson-player-and-progress) is derived at read time over the currently published lessons. Rows stay when a member leaves the group. Migration `0014_course_lesson_completions.sql` adds the table and its `(group_id, course_id, user_id)` index.

### `course_lesson_positions`

Added in C6b. Group ID, course ID, lesson ID, user ID, step key, step index, passed steps, total steps, and updated timestamp; the primary key is `(lesson_id, user_id)`. The step key and index are the last [player step](courses.md#lesson-positions) shown, for resuming. Passed steps of total steps is the furthest share of the lesson passed, which counts toward course progress while the lesson is unfinished; a check keeps `total_steps > 0` and both the index and passed steps below it. Finishing the lesson deletes the row. Rows cascade from their course and lesson, lesson deletion also removes them explicitly in its batch, and they stay when a member leaves the group. Indexed by `(group_id, course_id, user_id)`. Migration `0016_course_lesson_positions.sql` adds the table.

## Speech

Added in C10a; migration `0019_speech.sql`. The [speech rules](speech.md) own behavior.

### `speech_clips`

One row per synthesized clip, shared across groups because a clip is content-addressed. Hash (primary key, the [clip identity](speech.md#generation)), voice, character count, status (`pending`, `ready`, or `failed`), attempt count, nullable next-attempt and claimed timestamps, and created/updated timestamps. The R2 key is `speech/{hash}.mp3`. Inserting the row is the claim that keeps Azure from being called twice for one clip. The row holds no lesson, course, or group ID and no text; the worker rebuilds the markup from the lesson it is processing. Rows and their R2 objects are kept when lessons change. A check constraint limits the statuses.

### `speech_jobs`

At most one pending job per lesson. Lesson ID (primary key), group ID, course ID, due timestamp, attempt count, and created/updated timestamps. Draft saves, publishing, and cast changes upsert it (resetting its attempt count); the worker deletes it once every spoken item of the lesson's documents is ready or failed, unless an upsert changed it during the run. Rows cascade from their course and lesson, and lesson deletion also removes the row in its batch. Jobs of a soft-deleted group are skipped while it is deleted. Indexed by due timestamp.

## Discussion

### `comments`

Opaque ID, group ID, nullable post ID, nullable practice block ID, author ID, nullable parent comment ID, plain body where applicable, created/updated timestamps, and a kind: `text`, `reading_response`, `fill_response`, or `practice_response`. A check constraint requires exactly one of post ID and block ID, so every comment belongs to one discussion target: a post or a practice block. Since migration `0015_lesson_documents.sql`, the block ID references `course_practices` and cascades from it. Parent comments must belong to the same target and themselves have no parent. Comments are indexed by `(group_id, post_id, parent_comment_id, created_at, id)` and `(group_id, block_id, parent_comment_id, created_at, id)`. Since migration `0022_course_practice_progress.sql` no comment has a block ID and the API writes no `practice_response` comments; the column, kind, and constraint stay only because removing them would need another rebuild of `comments`.

Migration `0011_course_practice_threads.sql` rebuilds `comments` with the block target and the new kind, and `0015_lesson_documents.sql` rebuilds it again to point the block target at `course_practices`. Because dropping a parent table can fire cascades, both migrations restore comments, response items, and pins from constraint-free copies after the rebuild.

### `comment_response_items`

For structured reading and fill answers (and, before migration `0022`, practice answers): comment ID, ordered position, optional prompt/question snapshot, answer text, skipped flag, and optional positive-match result. Snapshots preserve understandable historical answers if an author later edits questions or prompts. Practice answer sets always snapshot each item prompt and never store a match result; the learner's answer check is not persisted. A fill-in practice item answered blank by blank stores its blanks as one answer joined by ` · `.

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
- Lessons are hard-deleted with their documents, practice anchors, practice progress, and their lesson images (rows and R2 objects). The API deletes the R2 objects after the batch.
- Removing a block from a lesson is an ordinary draft edit. A practice removed from both documents loses its anchor and progress at the next publish or discard, after the editor warns the owner when anyone has started it; images referenced by neither document are cleaned up as described under `course_media`.
- Member departure never deletes authored content or reactions. Contributor departure or removal keeps their lessons and updated-by attribution. Lesson completions and positions also stay and are hidden while the member is not active.
- Deleting a lesson deletes its completions and positions.
- Records and images otherwise remain indefinitely.
- Replaced/removed R2 images are deleted after database state safely points away from them.

## Indexing and isolation

Index the feed by `(group_id, created_at, id)`, memberships by user and state, pending membership requests by group/state, profile posts by `(group_id, author_id, created_at, id)`, comments by post/parent/order and by block/parent/order, reactions by target, the course library by `(group_id, created_at, id)`, lessons by `(group_id, course_id, position)`, practice anchors and practice progress by `(group_id, lesson_id)`, lesson media by `(group_id, lesson_id, created_at)`, course contributors by `(group_id, course_id, state)`, lesson completions by `(group_id, course_id, user_id)`, and notifications by `(recipient_id, group_id, created_at)` plus `(recipient_id, created_at)` for restricted status lookup.

Every tenant-owned table includes or can unambiguously derive `group_id`. Favor explicit `group_id` when it makes authorization and indexes safer, even if technically redundant.
