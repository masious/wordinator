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

Opaque ID, group ID, author ID, type, primary body, optional notes, created/updated timestamps, and edited state derived from timestamps or stored explicitly. The primary body is sentence, question, paragraph, or fill prompt according to type.

### `reading_questions`

Post ID, stable question ID, zero-based/one-based position, and question text. Unique position within a reading post.

### `fill_expected_answers`

Post ID, blank position, and nullable/optional expected text. The number of recognized `…` tokens is validated against configured answers.

Phase 3 persists these tables in migration `0005_phase_three_posts.sql`. Expected-answer rows are sent back only to their post author for editing; later answer matching remains server-side so ordinary post reads do not disclose them.

## Courses

The [courses blueprint](courses.md) owns course behavior.

### `courses`

Opaque ID, group ID, owner ID, title, summary, optional level, optional intended learner, optional cover key, status (`draft`, `published`, or `archived`), and created/updated timestamps. A check constraint limits status to those three values. Owner display uses the live or group snapshot profile at read time, like post authors.

Migration `0009_course_shell.sql` adds the table and its library index.

## Discussion

### `comments`

Opaque ID, group ID, post ID, author ID, nullable parent comment ID, plain body where applicable, created/updated timestamps, and a discriminator for ordinary text versus structured reading/fill response. Parent comments must belong to the same post and themselves have no parent.

### `comment_response_items`

For structured reading/fill answers: comment ID, ordered position, optional prompt/question snapshot, answer text, skipped flag, and optional positive-match result. Snapshots preserve understandable historical answers if an author later edits questions or prompts.

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

Opaque ID, group ID, recipient ID, actor ID, event type, optional post ID, optional comment ID, read timestamp, and creation timestamp. Actor display uses the live or group snapshot profile at read time. Post/comment IDs intentionally have no foreign key so notifications survive target deletion. Never store credentials, tokens, or complete content bodies in notification metadata.

## Deletion and retention

- Groups are soft-deleted through `deleted_at`; all group records remain recoverable.
- Posts are hard-deleted with questions, expected answers, comments, response items, reactions, and pins.
- Comments are hard-deleted with replies, response items, and reactions.
- Notifications survive target deletion.
- Courses are never hard-deleted. Archiving sets status `archived`; restoring returns the course to `draft` so the owner chooses again when to publish. Archived courses keep their cover image.
- Member departure never deletes authored content or reactions.
- Records and images otherwise remain indefinitely.
- Replaced/removed R2 images are deleted after database state safely points away from them.

## Indexing and isolation

Index the feed by `(group_id, created_at, id)`, memberships by user and state, pending membership requests by group/state, profile posts by `(group_id, author_id, created_at, id)`, comments by post/parent/order, reactions by target, the course library by `(group_id, created_at, id)`, and notifications by `(recipient_id, group_id, created_at)` plus `(recipient_id, created_at)` for restricted status lookup.

Every tenant-owned table includes or can unambiguously derive `group_id`. Favor explicit `group_id` when it makes authorization and indexes safer, even if technically redundant.
