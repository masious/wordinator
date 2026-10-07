# Courses

Status: delivered. C1 (course shell), C2 (lessons and content blocks), C3 (practice blocks and answer threads), C4 (feed presence), C5 (contributors), and C6 (lesson player and progress) are complete. C7 (lesson editor) is approved and in progress; see [lesson documents](#lesson-documents). Delivery phases live in the [roadmap](roadmap.md#course-phases).

## Purpose

A course is a long-lived, member-authored learning journal that belongs to one group. Members build it gradually, lesson by lesson, and practise it together. Courses complement the feed; they do not replace it. Nothing in a course is generated, translated, or graded by the platform.

## Structure

```text
course
  └─ lesson (ordered)
       └─ block (ordered)
```

There is no separate section level. A `heading` block titles a part of a lesson, so moving content between parts is an ordinary reorder.

### Course

- Required: title, summary
- Optional: level (free text, for example `A1 → early A2`), intended learner, cover image
- Owner: the member who created it
- Status: `draft`, `published`, or `archived`

Any active member may create a course. Draft courses are visible only to their owner and contributors.

### Lesson

- Required: title
- Optional: goal
- Ordered by position within the course
- Published flag; unpublished lessons are visible only to the owner and contributors

Lesson numbers shown to readers are derived from position, never stored.

### Blocks

Every block has an ordered position, a published flag, a kind, and a kind-specific payload. Payloads are validated by one shared Zod schema per kind and carry a payload version so stored content survives later shape changes.

| Kind | Payload |
| --- | --- |
| `heading` | title |
| `text` | content |
| `example` | sentence, optional translation, optional note |
| `dialogue` | ordered turns, each with a short speaker label and text |
| `practice` | instruction, optional passage (optional title, content), ordered items |

A practice item has a prompt, an optional author's version, and an optional note. Practice blocks have no mode field:

- A prompt containing one or more single-character `…` tokens is a fill-in item. Its author's version has exactly one nullable entry per blank, mapped left to right, matching the [fill-in post rule](posts-and-feed.md#fill-in-the-blanks).
- Any other prompt is open: translate, rewrite, or answer a question. Its author's version has at most one entry.
- An author's version with no filled entry is stored as an empty list, meaning the item has no author's version.
- A passage turns the block into a reading exercise whose items are its questions.

All block text is plain text under the [global content rules](product-requirements.md#global-content-rules). Highlighting is expressed by block kind, never by inline markup.

> C7 replaces this block model, the per-block published flag, and the per-block editing model with [lesson documents](#lesson-documents). The rules in this section stay authoritative for the running code until C7b ships.

### Limits

Limits are safeguards, not learning constraints. They live in the shared contracts.

| Field | Limit |
| --- | --- |
| Course title / lesson title / heading / course level | 200 characters |
| Course summary, intended learner, lesson goal | 2,000 characters |
| Text content, passage content | 10,000 characters |
| Example sentence, translation, item prompt | 1,000 characters each |
| Practice instruction | 2,000 characters |
| Notes, author's version entry | 2,000 / 1,000 characters |
| Practice answer entry | 4,000 characters |
| Dialogue turns | 50 per block, speaker label 40 characters, line 1,000 characters |
| Practice items | 50 per block |
| Blocks per lesson | 200 |
| Lessons per course | 200 |

## Lesson documents

Approved product change (C7), in progress. It replaces per-row blocks with one rich document per lesson, edited in a Notion-style block editor. Until C7b ships, the [blocks](#blocks) and [editing model](#editing-model) sections describe the running code.

### Editor and format

- Lessons are edited with [BlockNote](https://www.blocknotejs.org) (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, MPL-2.0) and columns come from `@blocknote/xl-multi-column`, licensed GPL-3.0 for this private, non-distributed application. The editor is loaded only on editing surfaces.
- A lesson document is `{ schemaVersion: 2, blocks }` and every block follows BlockNote's own JSON convention: `{ id, type, props, content, children }`. Block IDs are stable and identify practice threads and merge units.
- The shared contracts own a strict Zod schema of the subset Wordinator accepts. The editor's output is never trusted; the API rejects anything outside the schema.

### Block types

| Type | Source | Content and props |
| --- | --- | --- |
| `paragraph` | built-in | inline content |
| `heading` | built-in | inline content, `level` 1–3; toggle headings are disabled |
| `bulletListItem`, `numberedListItem` | built-in | inline content, nesting up to 3 levels |
| `divider` | built-in | none |
| `image` | built-in | `url` (stored as an R2 key), `caption`, `previewWidth`; alt text required |
| `columnList` → `column` | xl-multi-column | 2–3 columns, `width`; top level only, never nested |
| `callout` | custom | inline content, `variant`, optional `icon` |
| `example` | custom | inline content for the sentence, plain-text `translation` and `note` |
| `dialogue` | custom | turns, as today |
| `practice` | custom | instruction, passage, and items, as today, kept plain text so fill-in tokens and answer snapshots work |

Every block is left-aligned; text alignment is not offered. Paragraphs, headings, and list items may carry a block `textColor` and `backgroundColor` from the same palette as inline colours; callouts take their colour from their variant. Only list items nest, up to 3 levels; no other block has children except `columnList` and `column`.

Callout variants are `hint`, `important`, `warning`, `grammar`, `culture`, `false-friend`, and `pronunciation`. Each variant sets a tone token and a default icon; `icon` may override the icon from a fixed list in the contracts. Any block, including practice and dialogue, may sit inside a column. Columns stack on narrow screens.

Authors make columns with the two- and three-column slash items, which always add a new column list at the top level (below the current one when the cursor is in a column), or by dragging a block onto the left or right edge of another block. Column widths come from BlockNote's resize handles and are stored as relative ratios. The editor refuses edge drops that would make a fourth column, put columns inside a column or list, or drag a column list into another one, and shows no drop cursor for them. Any other change that still leaves such a structure (for example a regular drop or an undo) is reshaped in place before saving: columns beyond the third and nested column lists are unwrapped into the blocks that follow, so the server never rejects what the editor shows.

### Inline content

Inline content is restricted rich text: bold, italic, `textColor`, and `backgroundColor`, and links. Emoji are ordinary text, inserted through the shared [emoji picker](#emoji-picker). Colours come from the fixed palette `default`, `gray`, `brown`, `red`, `orange`, `yellow`, `green`, `blue`, `purple`, and `pink`, mapped to [design tokens](design-system.md). Links accept only `http` and `https`. Underline, strike, code, and arbitrary HTML are rejected. The reader renders documents with Wordinator's own renderer, which escapes all text.

Pasted and dropped content is brought into this subset in the editor before it is saved, so a paste never leaves an unsaveable draft. HTML and Markdown are parsed into the lesson schema, which drops underline, strike, code, and unknown block types; the editor then unwraps links that are not `http` or `https` (keeping their text), resets colours outside the palette and any alignment, and removes images that are not uploads of this lesson. A pasted image file, or a clipboard holding only an image (a copied picture or screenshot), goes through the [lesson image dialog](#images); a clipboard with text keeps its text, since office apps also put a picture of the copied text on the clipboard.

### Drafts and publishing

- Each lesson stores a draft document and a published document. A lesson with no published document is unpublished.
- The owner and active contributors edit the draft of any lesson, published or not. The draft autosaves with an integer draft version; a stale save returns a conflict and the editor merges by block ID, asking only when both sides changed the same block.
- The merge is three-way: the draft the edit started from, the author's edit, and the newer draft. A block changed on one side takes that side's version, and deleting an unchanged block wins. Positions follow the newer draft, except blocks the author added or moved while the newer draft left them in place; a block whose parent was deleted takes the parent's place. A block's own type, props, and content are compared, not its children, so a move on one side and an edit on the other both apply.
- A block changed differently on both sides, or deleted on one side and edited on the other, is shown side by side (newer version and the author's edit). Until the author chooses, the editor holds the newer version, or the edited one where the other side deleted the block. The merged draft is saved against the newer version straight away; unchosen alternatives last until the author leaves the editor.
- When the merged draft would break the contracts, or a local edit restored on opening the editor was based on an older draft (only the edit is stored on the device, not the draft it started from), the editor loads the newer draft and keeps the author's whole edit aside to use instead or discard.
- Drafts may hold unfinished work, such as an image whose upload has not finished. Publishing requires a finished document: every image has an uploaded file and alt text, and every example has a sentence.
- Only the owner publishes (copies the draft to the published document), discards the draft (resets it to the published document), and unpublishes.
- Publishing deletes practice threads whose practice is in neither document, after the editor warns the owner, and deletes R2 images referenced by neither document under the [image rules](#images).
- Learners only ever receive the published document, with authors' versions and item notes stripped.

### Emoji picker

The editor's emoji insertion uses Wordinator's shared `EmojiPicker` molecule instead of BlockNote's built-in emoji menu, so lessons and [reactions](discussions-and-reactions.md) use one picker. The molecule wraps [Frimousse](https://frimousse.liveblocks.io) (MIT, unstyled) and is styled with CSS Modules and design tokens. Emoji data comes from `emojibase-data` served from Wordinator's own origin; the picker never fetches from a third-party CDN.

### Images

Lesson images reuse the [public R2 image pipeline](architecture.md#images) under `courses/{courseId}/lessons/{lessonId}/` keys. Uploads are tracked per lesson; the API accepts only image keys uploaded to that lesson and turns keys into URLs on read. Like every R2 image, lesson images, including draft-only ones, are public to anyone with the URL, and the upload dialog says so.

- An image enters a lesson only by upload: the image slash item, BlockNote's upload panel (which has no link tab), or pasting or dropping an image file. Links to images elsewhere are never accepted.
- Every upload passes through the lesson image dialog. The author keeps the whole image (the default) or crops it to 4:3, 16:9, square, or 3:4 and zooms. The cropper library has no free-aspect mode, so these presets stand in for it.
- The browser re-encodes every image as JPEG before upload: original metadata (such as location) is dropped, the longest edge is capped at 1600 px, and quality steps down until the file fits the 1 MB server limit. Any image the browser can decode may be chosen, with sources up to 20 MB; the server still accepts only static PNG, JPEG, and WebP.
- Alt text is stored in the image's `name`, starts empty (a file name is not a description), and is edited from the image toolbar. Publishing requires it. The toolbar also edits the caption, replaces, and deletes the image; resize handles set the preview width, stored in whole pixels.
- Images referenced by neither the draft nor the published document are deleted with their R2 objects once they are older than 24 hours: at publish and discard, and by a daily sweep that also covers drafts that are never published. The 24-hour grace keeps uploads that an unsaved edit may still reference. Deleting a lesson deletes all its images.

## Practice answers

Answers are collaborative, not graded. Participants decide together whether an answer works, because a sentence can have several valid translations.

- Each practice block has its own answer thread, built on the shared [discussion and reaction system](discussions-and-reactions.md#course-practice-threads).
- A top-level answer is one ordered answer set covering every item, like a reading answer set. Blank entries are allowed.
- Answers begin concealed and are revealed only by explicit consent, exactly like post answers.
- The author's version and item notes are delivered only with the revealed thread. They are a reference for discussion, never a verdict.
- There is no automatic matching, no positive-match signal, no pinning, and no score. Answering is never required to finish a lesson; [progress](#lesson-player-and-progress) counts finished lessons, not answers.
- Answer sets snapshot each item prompt so they stay understandable after the practice is edited. Editing an answer set keeps those snapshotted prompts; a new answer set follows the current items.
- Unsent answer sets are local drafts with draft kind `practice-answer` and the block ID as target.
- Practice-thread activity creates no notifications.

## Lesson player and progress

Approved product change (C6): a light, non-competitive layer of progress on top of courses. It is the one deliberate exception to the [no-gamification non-goal](what_is_it.md#explicit-non-goals); points, streaks, badges, rankings, and leaderboards remain out of scope.

### Lesson player

Every lesson with content has a Start lesson action (Practise again once finished) that opens a focused, step-by-step player with a progress bar and a step counter. Below `48em` the player is a full-screen sheet, and the course page's lesson outline collapses behind a Lessons toggle that closes again once a lesson is chosen.

- Blocks become steps in lesson order. A `heading` is not a step; it labels the steps that follow it.
- A `text` block and an `example` block are one step each. An example's translation starts hidden behind Show translation, and its note appears with the translation (or immediately when there is no translation).
- Each `dialogue` turn is a step: lines appear one after another, earlier lines stay visible and muted, and the newest line is emphasized.
- Each `practice` item is a step that asks one question with one answer field. The instruction stays visible, and a passage is collapsible and open on the first item. Answers use the same local `practice-answer` draft as the lesson view, so either surface can continue a set. On the last item, a learner with at least one answer may share the set to the practice thread; otherwise it stays a private draft. Sharing follows the ordinary [practice answer](#practice-answers) rules and does not reveal the thread inside the player.
- Steps are fixed when a run starts; a refetch during the run never moves the learner. Back and Next move freely. There is no timer and nothing is marked right or wrong.
- After the last step the player shows a completion screen with the learner's course percentage and offers the next lesson or a return to the course.
- Owners and contributors can run unpublished lessons as a preview. Previews never count toward progress, and the completion screen says so.

### Progress

- Finishing a published lesson in the player records one completion per member and lesson. Repeating the lesson keeps the first completion. Reading the lesson page alone does not record anything.
- A member's course progress is the number of finished lessons among the currently published lessons, as a whole percentage rounded down. Unpublishing a lesson removes it from both counts; republishing restores it. Editing a finished lesson does not reset it. Deleting a lesson deletes its completions.
- The course page shows a Progress panel, visible to everyone who can see the course, listing every active group member with their percentage and `completed of total` lessons. Members are listed by name, never ranked. The panel is hidden while the course has no published lessons or is archived.
- The outline marks the viewer's finished lessons with a check.
- Former members disappear from the panel; their completions stay stored and reappear if they rejoin.
- Archived courses refuse new completions (`409 COURSE_ARCHIVED`), and unpublished lessons refuse them (`409 LESSON_UNPUBLISHED`).
- Progress creates no notifications and no feed posts.

## Contributors and publishing

Course roles are per course and do not add group roles.

- **Owner:** edits everything, decides contributor requests, publishes and unpublishes the course, lessons, and blocks, and archives the course.
- **Contributor:** an accepted member who may add lessons and blocks and edit any unpublished lesson or block. Contributor work stays a draft until the owner publishes it.
- **Participant:** every active group member may read published content and answer practices.

Any active member may request to contribute. Requests follow the membership pattern: states are `pending`, `active`, `rejected`, `left`, and `removed`; there is at most one pending request per member and course; rejected, departed, and removed members may request again.

Published lessons and blocks are edited only by the owner. To let a contributor rework published content, the owner unpublishes it first. This keeps the owner's publishing decision meaningful without storing parallel revisions.

The group creator keeps the moderation powers described in [groups and membership](groups-and-membership.md#creator): they may remove any block, lesson, or answer and archive any course.

Contributor rules settled in C5:

- A member asks to contribute from the course page of a published course they can read; the owner cannot. The owner sees pending requests on the course page and accepts or rejects them. Only a requester who is still an active group member can be accepted.
- Requests and decisions notify: the owner on a request, and the requester on acceptance or rejection. Removal and leaving create no notification.
- A contributor may withdraw a pending request or leave an active role; both end as `left`. Only the owner removes an active contributor. The group creator does not decide contributor requests for another member's course.
- Contributors add lessons and blocks, including unpublished blocks inside a published lesson, and edit unpublished lessons and blocks. They cannot publish (`403 COURSE_PUBLISH_FORBIDDEN`) or change published content (`403 COURSE_CONTENT_PUBLISHED`).
- Reordering, deleting lessons and blocks, course details, the cover, course visibility, and contributor decisions stay with the owner, and deletion also with the group creator as moderation.
- Active contributors see a draft course and its unpublished lessons and blocks, receive practice references as editors, and see who last edited each lesson and block. Archived courses stay hidden from them.
- Leaving or being removed from the group ends every pending request and active contributor role in that group. Rejoining does not restore them.

## Editing model

Authors save small pieces, so they can return to a course at any time.

- Every course, lesson, and block is saved through its own endpoint. There is no whole-course save.
- Lessons and blocks carry an integer version. An update must send the version it was based on; a stale version returns a conflict instead of overwriting a collaborator's work. After a conflict the editor keeps the author's unsaved edit and lets them either rebase it on the newer version and save again, or discard it.
- An update carries the item's full editable state, including its published flag, so publishing is also a versioned edit. A block keeps its kind; changing kind means adding a new block.
- Reordering sends the complete ordered ID list for one parent, and the server rewrites positions in one D1 batch. A list that no longer matches the parent's children is rejected. Reordering does not change versions.
- Server-side unpublished content is the durable draft. Local storage keeps only an unsaved block edit, under the [draft-key rules](posts-and-feed.md#composer-and-drafts) with draft kind `course-block` and the block or lesson ID as target.

## Reading and loading

- The course library lists the group's courses that the viewer may see, newest first. Library filtering by level is permitted because the library is not the feed.
- A course read returns the full outline (lesson IDs, titles, goals, positions, published state) plus the blocks of the first three visible lessons.
- Further lessons load by ID as the reader advances.
- Learner payloads never include authors' versions or item notes. Editors receive them for editing.

## Feed presence

The first time the owner publishes a course, the API creates one post of type `course` linked to it, authored by the owner. The post carries reactions and ordinary visible comments, appears in strict chronological order at its creation time, and leads to the course from its post page. It is not edited through the composer and cannot be pinned. Unpublishing, republishing, archiving, and restoring never create another post, and a deleted course post is not recreated. Archiving the course leaves the post in place, and the post then shows that the course is unavailable; a course returned to draft is likewise unavailable to everyone but its owner. Comments on the post notify its author like any post response. The [post type rules](posts-and-feed.md#course) own the card.

Courses published before C4 shipped count as already announced and have no course post.

Feed posts about later course changes are future work and will be derived from a course activity log.

## Media

The cover image reuses the [public R2 image pipeline](architecture.md#images) with the [interactive](settings-and-administration.md#image-cropper) wide crop and keys under `courses/`. Replacement and removal clean up superseded objects. Lesson images are described in [lesson documents](#images).

## Deletion and retention

Courses are archived, not hard-deleted. The owner or group creator may archive and restore a course; archived courses are hidden from the library except to the owner and group creator. Restoring returns the course to draft, and archived courses cannot be edited until they are restored. Deleting a lesson or block is hard deletion and removes its answer threads, replies, and reactions. Contributor departure keeps their authored content.

## Deferred

- Speaking practice, speak-and-repeat, and spoken answers. These need an explicit product exception for audio and pronunciation, and a privacy review because browser speech recognition may send audio to the browser vendor.
- Text-to-speech playback and interactive role-play dialogues
- Feed posts for course updates
- Course-specific notifications beyond contributor requests
