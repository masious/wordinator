# Data model

This is a conceptual relational model, not final migration syntax. The Drizzle schema and migrations must preserve these constraints.

## Global-library migration state

The product model is now accounts → courses → lessons, with one course library for the installation. `groups`, `memberships`, and `group_id` columns are legacy storage compatibility, not product tenancy. They remain temporarily so existing lesson documents, R2 media ownership, course progress, word bookmarks, and speech jobs are preserved during rollout. New features must not create or switch libraries, use invitation state, or grant behavior from membership lifecycle state.

## Platform metadata

### `platform_metadata`

Key, JSON text value, and updated timestamp. Since C14 the key `ai_settings` holds the [AI settings](settings-and-administration.md#ai-settings) (provider order, model per provider, daily turn cap, daily speech character cap), validated by the contracts' `aiSettingsSchema` on read and write; a missing or invalid row reads as the defaults.

## Identity and groups

### `users`

Opaque ID, normalized unique email, password hash and parameters, case-insensitively unique nullable username, onboarding-completed timestamp, display name, optional bio/avatar key, three quick-reaction emoji, `must_change_password`, `is_superuser` (C14e migration `0028_superuser.sql`, default false; set only by the operator command in [operations](operations.md#superuser-command)), and timestamps. New registrations keep username and onboarding completion null until required setup; existing accounts are backfilled by migration `0020_global_accounts.sql`. There is no account-deletion state initially.

### Legacy `groups`

Opaque ID, creator user ID, name, immutable language code (`nl` or `de` initially), optional icon key, invitation token/hash, creation/update timestamps, and nullable `deleted_at`.

### Legacy `memberships`

Group/user pair, lifecycle state, timestamps, and enough state to restore memberships active at group deletion. Enforce one row per group/user. The group’s creator has an active membership but creator authority is owned by `groups.creator_user_id`.

Memberships also keep the last group-visible display name, bio, and avatar key. Active account profile edits refresh these fields. Former-member reads use the snapshot instead of current account fields, preventing a group from observing profile changes made after departure.

Join request decisions and membership transitions should retain the facts needed for the restricted status experience. This may be captured in membership timestamps/state or a small transition/event table; do not create duplicate pending requests.

## Posts

### `posts`

Opaque ID, group ID, author ID, type, primary body, optional notes, nullable course ID, created/updated timestamps, and edited state derived from timestamps or stored explicitly. The primary body is sentence, question, paragraph, or fill prompt according to type. A check constraint limits type to `shared_sentence`, `question`, `reading`, `fill_in`, `course`, and `lesson_share`. Migration `0024_lesson_shares.sql` (C11a) adds `lesson_share` by rebuilding `posts` the way `0012` did, restoring the same children from constraint-free copies.

A `course` post is system-created on a course's first publication. Its body is empty and its course ID links the course; a check constraint requires a course ID exactly when the type is `course`, and a unique index on course ID allows at most one post per course. Course reads use the live course row. Migration `0012_course_feed_posts.sql` rebuilds `posts` for the course link and type, restoring reading questions, expected answers, comments, response items, and pins from constraint-free copies.

A `lesson_share` post has an empty body, its sharer's note in notes, and exactly one [`post_lesson_shares`](#post_lesson_shares) row.

### `post_lesson_shares`

Added in C11a by `0024_lesson_shares.sql` ([lesson shares](lesson-shares.md)). Post ID (primary key, cascading from the post), group ID, author ID (the sharer), kind (`example`, `dialogue`, or `question`), course ID, nullable lesson ID (set to null when the lesson is deleted), block ID, nullable item index (questions only, the item's position at share time), share key, snapshot (JSON text, null for a dialogue), course title and lesson title saved at share time, and created timestamp.

- The share key is the contracts' `lessonShareKey`: the block ID for an example or dialogue, and `{blockId}:{prompt}` with the prompt normalised by `normalizeAnswer` for a question. A unique index on `(author_id, share_key)` allows one share per person and piece; deleting the post frees it.
- The snapshot follows the contracts' schema for its kind. An example keeps its inline content, translation, note, and example clip hash; a question keeps the practice instruction, the prompt, the author's version list, and the item index. Item notes are never stored.
- A dialogue has no snapshot and is read from the lesson's published document on every read.
- Check constraints keep the row consistent: kind is one of the three, an item index is present exactly for a question, a snapshot is present exactly when the kind is not `dialogue`, and a snapshot is valid JSON.
- Indexed by `lesson_id` for lesson deletion and by `(author_id, lesson_id)` for the lesson read's `myShares`.

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

A practice block in a document carries its payload as a JSON string: the instruction, an optional passage, and ordered items with a prompt, an author's version list (empty when there is none), and an optional note. Learner reads of the published document keep authors' versions, which the browser checks answers against, and remove notes; see [courses](courses.md#practice-answers).

Migration `0010_course_lessons_blocks.sql` added lessons with per-row `course_blocks`, and `0011_course_practice_threads.sql` added the practice kind. Migration `0015_lesson_documents.sql` alters `course_lessons` in place (it is never rebuilt, because completions, practices, and media cascade from it), maps each lesson's blocks into a draft document and its published blocks into a published document exactly as the contracts' `upgradeLegacyBlocks` does, and drops `course_blocks` together with the old published flag and version columns.

### `course_practices`

Opaque ID (the practice block's ID in the document), group ID, course ID, lesson ID, and created timestamp. One anchor row per practice block ID found in either document of a lesson, so practice progress keeps a real foreign key while the practice itself lives in JSON. Draft saves add anchors for new practice IDs and refuse IDs that belong to another lesson; publishing and discarding delete anchors, with their progress, whose practice is in neither document. Rows cascade from their course and lesson. Migration `0015_lesson_documents.sql` adds the table, its `(group_id, lesson_id)` index, and an anchor for every existing practice block.

### `course_practice_progress`

Practice ID, group ID, course ID, lesson ID, user ID, answered count, and updated timestamp, with primary key `(practice_id, user_id)` and an index on `(group_id, lesson_id)`. It records only how many questions of a [practice](courses.md#practice-answers) a learner has answered, never the answers, and saving keeps the highest count. Rows cascade from their practice anchor, course, and lesson. Migration `0022_course_practice_progress.sql` adds the table, turns each shared practice answer set into its author's row (the most items answered in any one set), and deletes every practice comment, its replies, response items, and reactions.

### `course_media`

R2 key (primary key), group ID, course ID, lesson ID, created-by user ID, and created timestamp. Every uploaded [lesson image](courses.md#images) has a row, so the API accepts only image keys uploaded to that lesson. Rows referenced by neither document and older than 24 hours are deleted with their R2 objects at publish and discard and by the daily sweep. Rows cascade from their course and lesson. Migration `0015_lesson_documents.sql` adds the table and its `(group_id, lesson_id, created_at)` index.

### `course_lesson_words`

Added in C8. A derived index of the words in each lesson's published document, so the [course word recap](courses.md#word-recap) never parses documents at read time. Group ID, course ID, lesson ID, block ID, word ID, position (document order within the lesson), term, meaning, and optional forms, example, and note. The primary key is `(lesson_id, word_id)`. The published document stays the source of truth: publishing replaces the lesson's rows from the new published document in the same D1 batch, unpublishing deletes them, lesson deletion also removes them explicitly in its batch, and rows cascade from their course and lesson. Text is stored trimmed, with empty optional fields as null. Indexed by `(group_id, course_id, lesson_id, position)`. Migration `0017_course_lesson_words.sql` adds the table empty, since no published document held vocabulary before it. Migration `0019_speech.sql` adds an optional `ipa` column carrying the word's [pronunciation override](speech.md#pronunciation-override), filled from the next publish of each lesson; reads use it to identify the term's clip and never return it. Migration `0023_word_search_keys.sql` adds nullable `term_key` and `search_key` columns for [word search](words.md#word-search): `wordSearchKey` of the term, and of the term, forms, and meaning joined by newlines. Publishing writes them; SQLite cannot fold diacritics, so rows indexed earlier start with null keys and the search endpoint fills up to 2,000 of them per request before searching, found through the partial index `course_lesson_words_unkeyed_idx` on `lesson_id` where either key is null. Substring matching (`LIKE '%…%'`) cannot use a B-tree index, so the search scans the group's index rows; this is acceptable while the table is bounded by the library's published lessons, and an FTS index is the next step if it is not.

### `course_word_bookmarks`

Added in C9b; see [bookmarks](words.md#bookmarks). Group ID, course ID, lesson ID, word ID, user ID, and created timestamp. The primary key is `(user_id, lesson_id, word_id)`. The row is a key only: word text is read from [`course_lesson_words`](#course_lesson_words) at read time, and there is deliberately no foreign key to that table, because publishing replaces a lesson's word rows and would cascade bookmarks away. A bookmark whose word is not in the index is hidden, not deleted. Rows cascade from their course and lesson, lesson deletion also removes them explicitly in its batch, Indexed by `(group_id, user_id, created_at)`. Migration `0018_course_word_bookmarks.sql` adds the table.

### `course_word_drill_states`

Added in C12 by migration `0025_course_word_drill_states.sql` and dropped by `0026_learning_data.sql` (C14a) before C12's release. It held the Leitner box per user, lesson word, and direction (`understand` or `produce`): box (1–5), last result, and last drilled timestamp, with primary key `(user_id, lesson_id, word_id, direction)`. The C14 migration turns each row into one `seed` row in [`word_reviews`](#word_reviews) and a [`word_memory`](#word_memory) row whose stability follows the box (see [word memory](words.md#word-memory)), then drops the table. The term key comes from the word index; a word indexed before search keys and never keyed since uses its lower-cased term when that term is plain single-spaced ASCII, and is otherwise skipped, as are states of words no longer in the index.

### `course_contributors`

Group ID, course ID, user ID, state (`pending`, `active`, `rejected`, `left`, or `removed`), requested timestamp, nullable decided timestamp, and updated timestamp. The primary key is `(course_id, user_id)`: like a membership, each member has one row per course whose state changes, so there is at most one pending request. A new request reuses a `rejected`, `left`, or `removed` row. A check constraint limits the states. Rows cascade from their course, and leaving or being removed from the group moves that member's `pending` and `active` rows in the group to `left` or `removed`. Contributor display uses the live or group snapshot profile at read time. Migration `0013_course_contributors.sql` adds the table and its `(group_id, course_id, state)` index.

### `course_lesson_completions`

Group ID, course ID, lesson ID, user ID, and completed timestamp. The primary key is `(lesson_id, user_id)`: a member finishes a lesson once, and repeating it keeps the first timestamp. Rows cascade from their course and lesson, and lesson deletion also removes them explicitly in its batch. No percentage is stored; [course progress](courses.md#lesson-player-and-progress) is derived at read time over the currently published lessons. Rows stay when a member leaves the group. Migration `0014_course_lesson_completions.sql` adds the table and its `(group_id, course_id, user_id)` index.

### `course_lesson_positions`

Added in C6b. Group ID, course ID, lesson ID, user ID, step key, step index, passed steps, total steps, and updated timestamp; the primary key is `(lesson_id, user_id)`. The step key and index are the last [player step](courses.md#lesson-positions) shown, for resuming. Passed steps of total steps is the furthest share of the lesson passed, which counts toward course progress while the lesson is unfinished; a check keeps `total_steps > 0` and both the index and passed steps below it. Finishing the lesson deletes the row. Rows cascade from their course and lesson, lesson deletion also removes them explicitly in its batch, and they stay when a member leaves the group. Indexed by `(group_id, course_id, user_id)`. Migration `0016_course_lesson_positions.sql` adds the table.

## Learning data

Added in C14 ([word memory](words.md#word-memory), [practice attempts](courses.md#practice-attempts), [reset](courses.md#reset)) by migration `0026_learning_data.sql` (C14a). None of these tables has `group_id`: they are new work under the [storage compatibility](groups-and-membership.md#storage-compatibility) rule and reach the backing library record through the course. Every row belongs to one user; reads always filter by the signed-in user's ID. Lesson and word IDs are keys into the published index with deliberately no foreign key to [`course_lesson_words`](#course_lesson_words), like bookmarks. Rows cascade from their user, course, and lesson where they carry them (except `progress_events`, below), and lesson deletion also deletes them explicitly in its batch, then rebuilds the affected memory rows. Conversation IDs have no foreign key, since the tutor's tables come later.

### `word_reviews`

Append-only log of graded word answers. ID, user ID, term key (`wordSearchKey` of the term), course ID, lesson ID, word ID, direction (`understand` or `produce`), result (`got` or `again`), source (`drill`, `ai_chat`, `ai_practice`, or `seed`), nullable seed box (the C12 Leitner box, 1–5, set only on `seed` rows so a rebuild reproduces the seeded stability), nullable conversation ID, and created timestamp. Checks limit direction, result, source, and the seed box. Indexed by `(user_id, term_key, direction, created_at)` for rebuilding, by `(user_id, lesson_id)` for reset, and by `lesson_id` for lesson deletion across accounts. Rows are deleted only by a lesson reset or lesson deletion.

### `word_memory`

One row per `(user_id, term_key, direction)`, the primary key, folded from that key's reviews: representative course, lesson, and word ID (the most recently reviewed occurrence), `recent` (the last ten results as a string of `g` and `a`, newest last), reps, lapses, nullable last lapse timestamp, stability (days, real), difficulty (real, 1–10), last reviewed timestamp, and `known_override` (boolean, default false). Recall probability is computed at read time and never stored. A row is always reproducible from [`word_reviews`](#word_reviews) (replayed in `(created_at, id)` order), except `known_override`, which a rebuild carries over; a key with no reviews left has no row. Indexed by `(user_id, last_reviewed_at)`.

### `practice_attempts`

ID, user ID, course ID, nullable lesson ID, practice kind (`lesson` or `ai`), practice ID (the practice block ID or the `ai_practices` ID), item index, prompt, answer, reference (the author's version or the AI practice's reference, nullable), nullable `matched`, nullable `ai_verdict` (`acceptable` or `error`), nullable `ai_note`, source (`lesson`, `ai_chat`, or `ai_practice`), nullable conversation ID, `hints_used` (the number of [word hints](ai-tutor.md#word-hints) opened before answering, 0–4, default 0; migration `0032_attempt_hints.sql`), and created timestamp. Checks limit the enums and the hint count. Prompt, answer, and reference are capped at 2,000 characters. Indexed by `(user_id, created_at)` and `(user_id, lesson_id)`. Unlike [`course_practice_progress`](#course_practice_progress), rows keep the answer text.

### `pronunciation_attempts`

ID, user ID, surface (`drill`, `word_card`, or `ai_chat`), reference text, nullable term key, lesson ID (its foreign key sets null), and word ID, overall, accuracy, fluency, and completeness scores (0–100), word scores (JSON text: word, accuracy, and error type per word), and created timestamp. Indexed by `(user_id, created_at)` and `(user_id, term_key)`. A lesson reset keeps these rows; lesson deletion sets their lesson and word IDs to null.

### `progress_events`

Audit only, never read to undo. ID, user ID, actor (`user` or `agent`), kind (`lesson_completed` or `lesson_reset`), course ID, lesson ID, nullable conversation ID, and created timestamp. Course and lesson IDs have no foreign key, so the audit outlives a deleted lesson. A completion writes its row only when the completion is new (repeating a lesson writes none); every reset writes one. Indexed by `(user_id, created_at)`.

## AI tutor

Added in C14; the [AI tutor](ai-tutor.md) owns behavior. No table has `group_id`. Migration `0029_ai_tutor.sql` (C14g) adds `ai_conversations`, `ai_messages`, and `learner_profiles`; their user foreign keys cascade.

### `ai_conversations`

ID, user ID, title (empty until the first user message, then that message on one line cut to 80 characters), nullable archived timestamp, `title_source` (`auto`, `tutor`, or `user`, check-constrained, default `auto`: who set the title, see [conversation titles](ai-tutor.md#conversation-titles); added by migration `0033_conversation_title_source.sql`), nullable `provider` (the learner's [model choice](ai-tutor.md#providers-and-fallback): `openrouter`, `workers_ai`, or `azure`, check-constrained; null follows the configured order; added by migration `0031_conversation_provider.sql`), and created/updated timestamps. Conversations are never deleted. Each stored message moves `updated_at`; archiving, renaming, and changing the model do not. Indexed by `(user_id, archived_at, updated_at)`.

### `ai_messages`

ID, conversation ID (cascading), user ID, role (`user` or `assistant`, check-constrained), parts (JSON text validated by the contracts' `tutorStoredPartSchema`: `text` with its target-language `spans`, `tool_call`, `tool_result`, `component`, `confirmation`, and `error` parts), status (`complete`, `awaiting_user`, or `error`, check-constrained), nullable provider and model, and created timestamp (strictly after the conversation's previous message). Cursor-paginated by `(conversation_id, created_at, id)`. A user message is one text part. A `tool_result` part also stores the JSON the model received (`content`), a `component` part the full payload with its reference answer (`component`) beside its view, and a `confirmation` part the tool's arguments; the API never returns these three. A component or confirmation part holds its tool call ID and, once answered, the answer, the grade or outcome, and `answeredAt` (a skipped component keeps no answer or grade and carries `skipped: true`, C14h); it is answered at most once, by a conditional update that also moves its message from `awaiting_user` to `complete`. A part that no longer fits the contracts is skipped on read.

### `learner_profiles`

User ID (primary key), native language (default `en`), reply language (`native`, `target`, or `mixed`, default `native`, check-constrained), nullable goals (plain text, at most 500 characters), nullable tutor notes (plain text, at most 2,000 characters), and updated timestamp. A missing row reads as the defaults; the first save of either the learner's fields or the tutor's notes creates it.

### `ai_usage`

One row per model request, successful or not (a fallback writes one row per provider tried). ID, user ID, nullable conversation ID (no foreign key; conversations are never deleted), provider (`openrouter`, `workers_ai`, or `azure`, check-constrained), model, turn start (whether the request is the first of a tutor turn; the [daily turn cap](ai-tutor.md#usage-and-limits) counts these rows), tokens in, tokens out, cost in micro-dollars, ok, and created timestamp. Indexed by `(user_id, created_at)` for the daily cap, `(created_at)` for analytics, and `(conversation_id)` for each conversation's token total in the tutor's list (migration `0033_conversation_title_source.sql`). Rows hold no prompt or answer text. Added in migration `0027_ai_usage.sql`.

### `ai_practices`

ID, kind (`fill_in`, `translate`, `word_order`, `article`, `choice`, `dictation`, or `fix_mistake`), payload (JSON text per the contracts' schema for the kind, including its reference answer), created-by user ID (cascading from the user; never shown, since AI practices are unattributed), nullable conversation ID (no foreign key, like `ai_usage`), and created timestamp. The kind is check-constrained. Added in migration `0030_ai_practices.sql` (C14h). See [AI practices](courses.md#ai-practices).

### `ai_practice_lessons`

Practice ID (cascading), lesson ID, course ID, after-block ID (a block of the lesson's published document when the tag was written), and position (0-based among the lesson's tags sharing that anchor, checked non-negative), with primary key `(practice_id, lesson_id)`. Rows cascade from their course and lesson, and lesson deletion removes them in its batch; a practice left without rows is deleted in the same batch, as is a practice whose last tag is removed. Indexed by `(lesson_id, after_block_id, position)` and `(course_id)`. Added in migration `0030_ai_practices.sql`.

## Tutor sessions and memory

Added in C14l (planned); [tutor sessions and memory](tutor-sessions-and-memory.md) owns behavior. One new migration adds these tables and columns; like the other learning tables none has `group_id`, every row belongs to one user and cascades from it, and reads always filter by the signed-in user.

Changes to existing tables:

- [`word_reviews`](#word_reviews): course, lesson, and word ID become nullable and a nullable `tutor_word_id` (cascading) is added; a check requires either the lesson word (course, lesson, and word ID) or the tutor word, never both, except on `seed` rows, which keep the lesson word. A nullable `topic_key` is added. Indexed by `(user_id, tutor_word_id)`.
- [`word_memory`](#word_memory): the representative course, lesson, and word ID become nullable and a nullable representative `tutor_word_id` is added, with the same either-or check. A term reviewed as both a lesson word and a tutor word has one row, represented by its most recently reviewed occurrence.
- [`practice_attempts`](#practice_attempts): course ID becomes nullable, allowed only for source `ai_chat` (a check), and a nullable `topic_key` and `topic_label` are added. Indexed by `(user_id, topic_key, created_at)`. Rows without a course are deleted only with their user.
- [`ai_practices`](#ai_practices): a nullable `personal_user_id` (cascading); when set, the practice is a personal practice visible only to that user. The kind check adds `reading`. A nullable `topic_key`.
- [`learner_profiles`](#learner_profiles): nullable `context_defaults` (JSON text per the contracts' `tutorContextScopeSchema`). `tutor_notes` is copied into one [`learner_notes`](#learner_notes) row and dropped.
- [`ai_conversations`](#ai_conversations): nullable `context_scope` (JSON text, the same schema); null reads as the learner's defaults.

### `ai_plans`

ID, user ID, conversation ID (cascading), title, nullable target minutes, steps (JSON text per the contracts' `tutorPlanStepsSchema`: kind, label, nullable topic, lesson IDs, estimated minutes, and status `pending`, `active`, `done`, or `skipped`), status (`active`, `completed`, or `ended`, check-constrained), nullable summary, started timestamp, nullable ended timestamp, and updated timestamp. A partial unique index allows one `active` plan per conversation. Indexed by `(user_id, started_at)`. A plan whose status is `active` and whose `updated_at` is more than 24 hours old reads as `ended`.

### `learner_notes`

ID, user ID, text (plain text, at most 300 characters), nullable topic key and label, nullable follow-up date (a UTC day, `YYYY-MM-DD`), nullable conversation ID (no foreign key), and created/updated timestamps. At most 50 rows per user, enforced in the API. Indexed by `(user_id, updated_at)` and `(user_id, follow_up_on)`.

### `tutor_words`

ID, user ID, term, term key (`wordSearchKey` of the term), meaning, nullable forms, nullable example, nullable topic key and label, nullable conversation ID (no foreign key), and created/updated timestamps. Unique on `(user_id, term_key)`. At most 500 rows per user, enforced in the API. Deleting a row deletes its reviews and observations and rebuilds the memory rows of its term key in the same batch.

### `tutor_word_lessons`

Tutor word ID (cascading), lesson ID, and course ID, with primary key `(tutor_word_id, lesson_id)`; at most five per word. Rows cascade from their course and lesson. Indexed by `(lesson_id)`.

### `word_observations`

ID, user ID, term key, either a lesson word (course, lesson, and word ID, no foreign keys, like bookmarks) or a tutor word ID (cascading), kind (`used_correctly` or `struggled`, check-constrained), nullable note (at most 200 characters), nullable conversation ID, and created timestamp. Indexed by `(user_id, term_key, created_at)`. Never read by the memory engine. Lesson deletion and a lesson reset delete the lesson's rows for the affected learners, like reviews.

### `ai_conversation_refs`

Conversation ID (cascading), short reference (`L3`, `W12`, `T4`, `N2`, `P1`), kind, and the full ID, with primary key `(conversation_id, ref)` and a unique `(conversation_id, kind, target_id)`. Written the first time an ID is shown to the model in a conversation; see [short references](tutor-sessions-and-memory.md#short-references).

## Speech

Added in C10a; migration `0019_speech.sql`. The [speech rules](speech.md) own behavior.

### `speech_clips`

One row per synthesized clip, shared across groups because a clip is content-addressed. Hash (primary key, the [clip identity](speech.md#generation)), voice, character count, status (`pending`, `ready`, or `failed`), attempt count, nullable next-attempt and claimed timestamps, and created/updated timestamps. The R2 key is `speech/{hash}.mp3`. Inserting the row is the claim that keeps Azure from being called twice for one clip. The row holds no lesson, course, or group ID and no text; the worker rebuilds the markup from the lesson it is processing. Rows and their R2 objects are kept when lessons change. A check constraint limits the statuses.

### `speech_usage`

Added in C14 for [on-demand audio](speech.md#on-demand-audio), migration `0027_ai_usage.sql`. ID, user ID, surface (`ai_message` or, since migration `0030_ai_practices.sql` rebuilt the table with the wider check, `ai_practice`; check-constrained), clip hash, characters, cached (whether the clip was already ready), and created timestamp. Indexed by `(user_id, created_at)` for the daily character cap and `(created_at)` for analytics. Holds no text.

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
- Posts are hard-deleted with questions, expected answers, lesson share rows, comments, response items, reactions, and pins.
- Deleting a lesson keeps its share posts: their lesson ID becomes null, snapshots stay readable, and dialogue shares become unavailable.
- Comments are hard-deleted with replies, response items, and reactions.
- Notifications survive target deletion.
- Courses are never hard-deleted. Archiving sets status `archived`; restoring returns the course to `draft` so the owner chooses again when to publish. Archived courses keep their cover image. A course post stays when its course is archived and is deleted like any other post.
- Lessons are hard-deleted with their documents, practice anchors, practice progress, practice attempts, word reviews recorded from them (memory rows of the affected terms are rebuilt in the same request), AI practice tags, and their lesson images (rows and R2 objects). The API deletes the R2 objects after the batch.
- A lesson [reset](courses.md#reset) deletes one learner's position, completion, practice progress, practice attempts, and word reviews for the lesson, rebuilds the affected memory rows, and writes a `progress_events` row.
- Tutor conversations are archived, never deleted. Usage rows, progress events, and pronunciation attempts are kept indefinitely.
- Since C14l: plans, notes, tutor words, observations, and lesson-less attempts are kept until the learner removes them (notes and tutor words) or the account is deleted. A lesson reset keeps tutor words, personal practices, and lesson-less attempts; lesson deletion removes the lesson's tutor word tags, observations, and personal practice tags.
- Removing a block from a lesson is an ordinary draft edit. A practice removed from both documents loses its anchor and progress at the next publish or discard, after the editor warns the owner when anyone has started it; images referenced by neither document are cleaned up as described under `course_media`.
- Member departure never deletes authored content or reactions. Contributor departure or removal keeps their lessons and updated-by attribution. Lesson completions and positions also stay and are hidden while the member is not active.
- Deleting a lesson deletes its completions and positions.
- Records and images otherwise remain indefinitely.
- Replaced/removed R2 images are deleted after database state safely points away from them.

## Indexing and isolation

Index the feed by `(group_id, created_at, id)`, memberships by user and state, pending membership requests by group/state, profile posts by `(group_id, author_id, created_at, id)`, comments by post/parent/order and by block/parent/order, reactions by target, the course library by `(group_id, created_at, id)`, lessons by `(group_id, course_id, position)`, practice anchors and practice progress by `(group_id, lesson_id)`, lesson media by `(group_id, lesson_id, created_at)`, course contributors by `(group_id, course_id, state)`, lesson completions by `(group_id, course_id, user_id)`, and notifications by `(recipient_id, group_id, created_at)` plus `(recipient_id, created_at)` for restricted status lookup.

Every legacy tenant-owned table includes or can unambiguously derive `group_id`. Tables added since C12 (the [learning data](#learning-data) and [AI tutor](#ai-tutor) tables, `speech_usage`) carry no `group_id` under the [storage compatibility](groups-and-membership.md#storage-compatibility) rule; they are scoped by user ID and reach courses through their course and lesson IDs. Favor explicit `group_id` when it makes authorization and indexes safer, even if technically redundant.
