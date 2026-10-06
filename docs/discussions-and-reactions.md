# Discussions and reactions

## Discussion structure

A discussion belongs to exactly one target: a post or a course practice block. Every discussion is two levels deep:

- Top-level comments or answers
- Direct replies to a top-level item

Replies cannot themselves receive replies. Multiple top-level submissions by the same person are allowed. Order top-level items oldest-first and replies oldest-first, except for the pinned item rule below.

Shared-sentence and [course post](posts-and-feed.md#course) comments are visible immediately. Question, reading, and fill-in top-level items are answers and begin concealed on each visit. The visible answer count is not a spoiler.

## Concealment

Concealment applies equally to authors and other members. A member may:

- Submit without seeing earlier answers
- Reveal without submitting
- Follow a direct answer/reply notification, which deliberately reveals the thread and scrolls to its target

Revealed state is ephemeral UI state and is not stored per user. Reopening the post begins concealed again. Concealment never substitutes for membership authorization.

## Reading answer sets

The reading wizard shows one question at a time and displays progress. It permits blank responses. Publication creates one top-level answer containing every original question in order plus the learner’s response; blank values render as “No answer.” Members react to and reply to the complete set, not individual questions.

## Pinning

Question, reading, and fill-in posts permit exactly one pinned top-level answer. The post author or group creator may pin, replace, or remove it. If the author leaves, the creator retains control. The pinned answer renders before all other answers regardless of age. Shared-sentence and course post comments cannot be pinned.

## Comment lifecycle

Authors may edit their own top-level items and replies; edits show an edited marker. The group creator may remove any item. Deleting a comment removes it completely rather than leaving a tombstone. Its replies and reactions are removed with it. Notifications remain as historical records with an unavailable-content destination.

## Reactions

Reactions are available on posts, top-level items, and replies.

- A user may apply several different emoji to one item.
- A user contributes at most one count for a particular emoji/item pair; selecting it again toggles it off.
- Self-reactions are allowed.
- Every rendered emoji chip shows its count; activating it exposes the members who used it.
- Any valid emoji used through the custom control appears alongside quick reactions.

Each account has exactly three unique quick-reaction preferences. Their defaults are owned by [profiles and settings](profiles-and-settings.md) and are currently 👍, ❤️, and 😂. A fourth control is a compact text input; it will later open an emoji picker, which is not yet implemented. Feed post cards show the controls as a vertical rail that names a chip's members in a tooltip and submits the custom input with Enter; discussions keep a horizontal row with an Add button and an identity line. Validate exactly one displayed emoji grapheme, including composed sequences such as flags, skin-tone variants, and families; reject text, punctuation, and multiple emoji.

## Implemented Phase 4 behavior

Discussion reads use `GET /api/groups/:groupId/posts/:postId/discussion`. Creation uses the post’s `/comments` collection; edits, deletion, and comment reactions address a comment beneath both its group and post. The API verifies active membership before every lookup and scopes nested post/comment IDs to the active group. Top-level and reply order is oldest-first, with the pinned top-level answer moved first. Discussion counts include both levels.

Question answers and shared-sentence comments use plain text. Reading and fill submissions use discriminated structured contracts and the server requires exactly one response slot for every current question or blank. Reading response rows snapshot their original question text. Fill matching remains server-side, trims surrounding whitespace, compares case-insensitively, and returns only positive-match state; absent expected answers return no judgment. Structured responses remain editable without changing their kind.

The post author and group creator may set or replace one pin through `PUT /api/groups/:groupId/posts/:postId/pin`; changing a post to a shared sentence removes any existing pin. Authors may edit and delete their own discussion items, while the creator may delete any item. Deleting a top-level item removes replies and all attached reactions.

Reaction toggles use an explicit desired `active` state, making retries idempotent. Post and comment payloads group reactions by normalized emoji and include the count, the current member’s state, and group-visible member identities. The three quick reactions come from account settings; valid custom emoji join the same summary.

## Course practice threads

Each published practice block in a [course](courses.md#practice-answers) has its own answer thread built on the same comments, replies, and reactions.

- Concealment is identical to posts: the thread starts concealed on every visit, shows its count, and is revealed by submitting or by explicit consent. Revealed state is not stored.
- A top-level answer is one ordered answer set covering every practice item, like a reading answer set. Blank entries render as “No answer”. Each entry snapshots its item prompt, so answers stay understandable after the practice is edited, and edits keep the snapshotted prompts.
- Replies are plain text, one level deep. Reactions work on answers and replies.
- There are no pins and no matching: nothing is marked as correct.
- The author's version and item notes are delivered only with the revealed thread, as a reference for discussion.
- Authors edit their own items; authors and the group creator delete them. Deleting a practice block or its lesson deletes the thread, response items, and reactions. Threads in archived courses cannot change.
- Practice-thread activity creates no notifications yet; course notifications beyond contributor requests are deferred.
