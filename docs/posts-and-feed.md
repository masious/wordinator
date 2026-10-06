# Posts and feed

## Post types

All posts have an author, group, type, optional notes, creation/update timestamps, and edited state. Notes are concealed on every visit.

### Shared sentence

- Required: sentence
- Optional: notes
- Discussion: visible ordinary comments
- Pinning: unavailable

### Question

- Required: question
- Optional: notes/hint
- Discussion: concealed top-level answers
- Pinning: one answer

### Reading

- Required: paragraph and one or more ordered questions
- Optional: notes/hint
- Feed card: paragraph preview only; questions appear on the detail page
- Response: one ordered answer set submitted through a wizard
- Discussion: concealed answer sets
- Pinning: one complete answer set

### Fill in the blanks

- Required: prompt containing one or more single-character ellipsis tokens (`…`)
- Optional: one expected answer per blank, mapped left-to-right; an entry may be absent
- Optional: notes/hint
- Published response: ordered answer list corresponding to blanks
- Discussion: concealed answers
- Pinning: one answer

Expected-answer feedback occurs only after submission. Trim surrounding whitespace and compare case-insensitively. Show a small positive match signal and no negative or “incorrect” judgment.

### Course

- System-created: the API creates one when a course is first published; see [courses](courses.md#feed-presence)
- Author: the course owner
- Content: the course; the card shows the live course title, level, summary, and cover
- Editing: never offered by the composer and refused by the API (`409 POST_NOT_EDITABLE`)
- Discussion: visible ordinary comments
- Pinning: unavailable
- Deletion: the author or group creator may delete it like any post; it is not recreated when the course is published again

In the feed, the course card is part of the card's link to the post. On the post page, the course preview links to the course only while the viewer can open it: the course is published, or it is the viewer's own draft. Otherwise, including after archiving, the card says the course is unavailable and the post carries no course title, summary, level, or cover.

## Composer and drafts

The feed begins with a one-line create prompt row (the member's avatar and "Write something…"). When it leaves the viewport, show a floating create action that opens the same flow. Use a centered modal on larger screens and a full-screen mobile composition surface.

The post-type chooser is at the top. Maintain independent field state for each type during the session and map compatible values, such as notes and primary text, without erasing prior type state. Clear composer state only after successful publication or explicit discard.

Persist drafts in local storage for posts, comments, replies, standalone answers, fill-in responses, and reading-wizard responses. Keys must include account, group, target content where applicable, draft kind, and a schema version. A newer deployment may discard incompatible drafts. Drafts survive navigation and sign-out on the same browser.

Phase 3 implements post-composer drafts with schema version `v1` and the key shape `wordinator:draft:v1:<account-id>:<group-id>:post:new`. One stored document contains independent state for all four composer post types; the system-created course type has no composer state. Switching to a type with no primary text or notes yet maps those compatible values from the current type without overwriting state already entered for the destination type. Publication and explicit discard remove the draft; closing the composer, navigation, and sign-out do not. Later writing flows use the same identity/version principles when their phases ship.

Phase 4 implements the remaining writing drafts with `wordinator:draft:v1:<account-id>:<group-id>:<draft-kind>:<target-id>`. Draft kinds distinguish comments, replies, standalone answers, fill responses, and reading responses; reply targets are the parent comment and all other targets are the post. Reading drafts include the current wizard step. Empty drafts are not retained, and successful publication clears only the submitted draft.

[Courses](courses.md#editing-model) add the draft kind `course-block`, using the same key shape with the block ID as target, or the lesson ID for a block not yet created. Only edits that differ from the saved block are retained. A successful save or an explicit discard removes the draft. Practice answer sets use the draft kind `practice-answer` with the block ID as target, and practice replies use `reply` with the parent comment as target. Empty answer sets are not retained, and publishing clears the draft.

## Feed

- One unfiltered stream in strict descending creation order
- Stable cursor pagination; do not use offset pagination for the growing feed
- Infinite loading for older pages
- No ranking, search, filtering, or feed pinning
- Cards show a byline sentence naming author, type, and relative time (for example “Ada asked a question 20 minutes ago.”), a suitable content preview, and a vertical reaction rail
- The byline and preview form one link to the post's detail page; the actions menu and reaction rail sit beside that link, never inside it. Authored URLs are not linked inside feed cards, and notes are revealed on the detail page
- Comment/answer and reaction counts live in the card's actions menu; cards have no footer
- Long content uses “Read more” to navigate to the canonical detail page; it does not expand inline
- Comments and answers never expand inside the feed

The feed and profile lists use opaque cursors encoding the final `(created_at, id)` tuple from a page. Queries order both columns descending, so equal timestamps remain stable. Initial and older pages default to 20 items and accept at most 100. The client exposes older loading as an explicit control that uses the infinite-query page model; it does not use offsets.

## New-post polling

Poll only for posts newer than the current newest cursor. Do not prepend them automatically. Display “1 new post” or “N new posts”; clicking reconciles/prepends them while preserving a sensible scroll position. Comments, reactions, notifications, and other records do not live-update initially.

The initial client polls every 30 seconds while the feed has a newest cursor and requests at most 100 newer posts per reconciliation.

## Editing and deletion

Authors may edit their posts without locking after responses. Any edit after creation shows an edited marker. Group creators may remove any post.

Deleting a post permanently removes its questions, expected answers, comments, replies, reactions, and post-specific pins. Notifications remain and resolve to “Content no longer available.”

The shared validation contracts own the Phase 3 safeguards: primary post body 10,000 characters, notes 4,000, each reading question 1,000, each fill expected answer 500, and at most 50 reading questions or fill blanks. Reading requires at least one question. Fill prompts require at least one literal single-character `…` and exactly one nullable expected-answer slot per token. The API accepts request bodies up to 128 KiB so valid structured posts fit beneath the transport limit.

Expected fill answers are returned only to the post author for editing. Other members do not receive them before the Phase 4 server-side response check.
