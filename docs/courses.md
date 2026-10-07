# Courses

Status: delivered. C1 (course shell), C2 (lessons and content blocks), C3 (practice blocks and answer threads), C4 (feed presence), C5 (contributors), C6 (lesson player and progress), and C6b (lesson positions) are complete. C7 (lesson editor) is approved and in progress; see [lesson documents](#lesson-documents). C8 (new words and recap) is approved and not started; see [new words](#new-words-and-recap). Delivery phases live in the [roadmap](roadmap.md#course-phases).

## Purpose

A course is a long-lived, member-authored learning journal that belongs to one group. Members build it gradually, lesson by lesson, and practise it together. Courses complement the feed; they do not replace it. Nothing in a course is generated, translated, or graded by the platform.

## Structure

```text
course
  └─ lesson (ordered)
       └─ lesson document (draft and published)
            └─ block (ordered)
```

There is no separate section level. A `heading` block titles a part of a lesson, so moving content between parts is an ordinary move inside the document.

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
- Content: one draft and one published [lesson document](#lesson-documents); a lesson without a published document is unpublished and visible only to the owner and contributors

Lesson numbers shown to readers are derived from position, never stored.

### Blocks

A lesson's blocks live in its [lesson document](#lesson-documents), which owns the block types, inline content, and publishing. Dialogue and practice blocks keep plain-text payloads so fill-in tokens and answer snapshots work.

A practice block has an instruction, an optional passage (optional title, content), and ordered items. A practice item has a prompt, an optional author's version, and an optional note. Practice blocks have no mode field:

- A prompt containing one or more single-character `…` tokens is a fill-in item. Its author's version has exactly one nullable entry per blank, mapped left to right, matching the [fill-in post rule](posts-and-feed.md#fill-in-the-blanks).
- Any other prompt is open: translate, rewrite, or answer a question. Its author's version has at most one entry.
- An author's version with no filled entry is stored as an empty list, meaning the item has no author's version.
- A passage turns the block into a reading exercise whose items are its questions.

### Limits

Limits are safeguards, not learning constraints. They live in the shared contracts.

| Field | Limit |
| --- | --- |
| Course title / lesson title / heading / course level / image alt text | 200 characters |
| Course summary, intended learner, lesson goal | 2,000 characters |
| Paragraph, list item, and callout text; passage content | 10,000 characters |
| Image caption | 1,000 characters |
| Link address | 2,048 characters |
| Example sentence, translation, item prompt | 1,000 characters each |
| Practice instruction | 2,000 characters |
| Notes, author's version entry | 2,000 / 1,000 characters |
| Practice answer entry | 4,000 characters |
| Dialogue turns | 50 per block, speaker label 40 characters, line 1,000 characters |
| Practice items | 50 per block |
| Blocks per lesson document | 200 |
| Lesson document size | 256 KB |
| Lessons per course | 200 |

## Lesson documents

Approved product change (C7). It replaced per-row blocks with one rich document per lesson, edited in a Notion-style block editor. Lessons created before C7 were converted by migration `0015`: each old block became the matching document block, and only previously published blocks of published lessons entered the published document.

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
| `vocabulary` | custom (C8) | ordered words, JSON-encoded like practice; see [new words](#new-words-and-recap) |

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

## New words and recap

Approved product change (C8), not started. Lessons introduce vocabulary explicitly, each player step shows the words it introduces, and a learner can review every word from the lessons they have finished in one slideshow. C8 builds on [lesson documents](#lesson-documents) and ships after the C7 release.

### Vocabulary block

A `vocabulary` block (shown to authors as "New words") holds an ordered list of words. Like practice, its payload travels as a JSON string prop checked by a shared schema. Each word has:

| Field | Required | Limit | Notes |
| --- | --- | --- | --- |
| `id` | yes | — | Stable UUID, unique within the document; identifies the word for the recap and later review |
| `term` | yes | 200 | Dictionary form in the target language, with its article where relevant (`der Hund`, `het huis`) |
| `meaning` | yes | 500 | |
| `forms` | no | 200 | Plural or principal parts (`die Hunde`, `lopen – liep – gelopen`) |
| `example` | no | 1,000 | One example sentence |
| `note` | no | 2,000 | |

- All fields are plain text. Gender, word class, and grammar are written into `term`, `forms`, or `note`; they are not separate fields.
- A block holds 1–50 words. Drafts may hold words with an empty term or meaning; publishing requires both (a `word-empty` publish problem).
- The block is top level or inside a column, like any other leaf block. Adding the block type does not change the document schema version.
- Learners receive the whole word, including the note; nothing in a vocabulary block is concealed.
- The lesson reader renders the block as a compact word list in place.

### Words in the player

A vocabulary block is not a step of its own. Its words appear in a New words panel on the step built from the block directly before it in the same heading section:

- After paragraphs, lists, images, or dividers, it ends that prose step and attaches to it. Prose that follows starts a new step.
- After an example or a callout, it attaches to that step.
- After a dialogue or practice, it attaches to every turn or item of that block, so the words stay visible throughout.
- With no preceding step in the section (first after a heading or at the start of the lesson), it attaches to the next step. A section with no other step shows the words as a step of their own.
- Consecutive vocabulary blocks combine into one panel in document order.
- Inside a column list read as one step, the words show in place. A column list read block by block applies these rules in leaf order.

### Word recap

- Recap is a slideshow in the player shell: one card per word showing the term and forms, with Show meaning revealing the meaning, example, and note. Back and Next move freely. Nothing is graded, recorded, or counted.
- **Lesson recap:** the player's completion screen offers Review words when the run had words. It uses the words of that run, so previews work too.
- **Course recap:** the course page offers Review words to a member who has finished at least one published lesson with words. It covers the currently published lessons the viewer has [finished](#progress), in lesson order and then document order. A term repeated across lessons (compared trimmed and case-insensitively) shows once, at its first occurrence.
- The course recap follows course visibility: archived courses offer no recap except to those who can still see them.
- The course recap reads the [`course_lesson_words`](data-model.md#course_lesson_words) index through `GET /groups/:groupId/courses/:courseId/words`, which proves membership and scopes by `group_id`.

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

- Steps come from the published document in order (`flattenToSteps` in the contracts). A `heading` is not a step; it labels the steps that follow it.
- Consecutive prose under one heading (paragraphs, list items, images, and dividers) is one step; blank paragraphs alone make no step. A `callout` and an `example` are one step each. An example shows its translation and note with the sentence.
- A column list without dialogue or practice is one step, laid out as in the reader. A column list containing dialogue or practice is read column by column, block by block, with the rules above.
- Each `dialogue` turn is a step: lines appear one after another, earlier lines stay visible and muted, and the newest line is emphasized.
- Each `practice` item is a step that asks one question with one answer field. The instruction stays visible, and a passage is collapsible and open on the first item. Answers use the same local `practice-answer` draft as the lesson view, so either surface can continue a set. On the last item, a learner with at least one answer may share the set to the practice thread; otherwise it stays a private draft. Sharing follows the ordinary [practice answer](#practice-answers) rules and does not reveal the thread inside the player.
- Steps are fixed when a run starts; a refetch during the run never moves the learner. Back and Next move freely. There is no timer and nothing is marked right or wrong.
- A published lesson the learner has started opens at their [saved step](#lesson-positions) with a Picked up where you left off note and a Start over action. Previews always start at the first step.
- After the last step the player shows a completion screen with the learner's course percentage and offers the next lesson or a return to the course.
- Owners and contributors can run unpublished lessons as a preview. Previews never count toward progress, and the completion screen says so.

### Progress

- Finishing a published lesson in the player records one completion per member and lesson. Repeating the lesson keeps the first completion. Reading the lesson page alone does not record anything.
- A member's course progress is the share of the currently published lessons they have worked through, as a whole percentage rounded down. Every published lesson weighs the same: a finished lesson counts whole, a started lesson counts as the furthest share of its steps the member has passed (see [lesson positions](#lesson-positions)), and an untouched lesson counts nothing. Unpublishing a lesson removes it from every count; republishing restores it. Editing a finished lesson does not reset it. Deleting a lesson deletes its completions and positions.
- The course page shows a Progress panel, visible to everyone who can see the course, listing every active group member with their percentage and `completed of total` finished lessons. Members are listed by name, never ranked. The panel is hidden while the course has no published lessons or is archived.
- The outline marks the viewer's finished lessons with a check.
- Former members disappear from the panel; their completions stay stored and reappear if they rejoin.
- Archived courses refuse new completions (`409 COURSE_ARCHIVED`), and unpublished lessons refuse them (`409 LESSON_UNPUBLISHED`).
- Progress creates no notifications and no feed posts.

### Lesson positions

Approved product change (C6b): the player remembers where a member stopped, so they can resume and so a started lesson counts in part toward progress. It stays inside the C6 progress exception and adds nothing competitive.

- Each move in the player of a published lesson saves the step now shown as the member's position in that lesson; opening the player alone saves nothing. Previews never save positions.
- A step is identified by its block ID, plus the dialogue line or practice item number inside it. Edits elsewhere in the lesson move the step's number but not its identity. When the step's block is gone, the player falls back to the saved step number, clamped to the lesson. The API resolves the key against the published document and refuses a key it cannot find (`409 LESSON_STEP_NOT_FOUND`); the player ignores that refusal.
- The passed share is the number of steps before the step shown, of the lesson's current step count, so the last step shown is still short of finishing. It never shrinks when the member steps back; when an edit shortens the lesson it is capped below the new count. Only Finish lesson counts the lesson whole.
- Finishing a lesson deletes its position. Practising a finished lesson again saves a new position for resuming, which never adds progress.
- The course page offers Pick up where you left off for the member's most recently moved unfinished lesson, labels each started lesson's action Continue lesson with its saved step, and refreshes progress when the player closes.
- A position is private to its member. Other members see only the resulting percentage in the Progress panel.
- Archived courses refuse positions (`409 COURSE_ARCHIVED`), unpublished lessons refuse them (`409 LESSON_UNPUBLISHED` for editors; `404` for readers, who cannot see them). Positions in unpublished lessons stay stored but do not count or show until the lesson is published again.
- New step kinds (such as C8's `words` step) must give their steps a stable key in `lessonStepKey`.

## Contributors and publishing

Course roles are per course and do not add group roles.

- **Owner:** edits everything, decides contributor requests, publishes, discards, and unpublishes the course and its lessons, and archives the course.
- **Contributor:** an accepted member who may add lessons and edit the draft document of any lesson, published or not. Contributor work stays in the draft until the owner publishes it.
- **Participant:** every active group member may read published content and answer practices.

Any active member may request to contribute. Requests follow the membership pattern: states are `pending`, `active`, `rejected`, `left`, and `removed`; there is at most one pending request per member and course; rejected, departed, and removed members may request again.

Because every lesson has a separate draft, contributors rework published lessons in the draft while learners keep the published version, and the owner's publish decision stays meaningful. A published lesson's title and goal are edited only by the owner.

The group creator keeps the moderation powers described in [groups and membership](groups-and-membership.md#creator): they may delete any lesson or answer and archive any course.

Contributor rules settled in C5:

- A member asks to contribute from the course page of a published course they can read; the owner cannot. The owner sees pending requests on the course page and accepts or rejects them. Only a requester who is still an active group member can be accepted.
- Requests and decisions notify: the owner on a request, and the requester on acceptance or rejection. Removal and leaving create no notification.
- A contributor may withdraw a pending request or leave an active role; both end as `left`. Only the owner removes an active contributor. The group creator does not decide contributor requests for another member's course.
- Contributors add lessons and edit any lesson's draft. They cannot publish, discard, or unpublish (`403 COURSE_PUBLISH_FORBIDDEN`), or change a published lesson's title and goal (`403 COURSE_CONTENT_PUBLISHED`).
- Reordering and deleting lessons, course details, the cover, course visibility, and contributor decisions stay with the owner, and deletion also with the group creator as moderation.
- Active contributors see a draft course, unpublished lessons, and every lesson's draft, receive practice references as editors, and see who last edited each lesson. Archived courses stay hidden from them.
- Leaving or being removed from the group ends every pending request and active contributor role in that group. Rejoining does not restore them.

## Editing model

Authors save small pieces, so they can return to a course at any time.

- Course details and lessons are saved through their own endpoints. There is no whole-course save.
- A lesson's content is saved as its whole draft document, autosaved by the editor under the [drafts and publishing](#drafts-and-publishing) rules. Lesson title and goal are saved separately and carry no version.
- Reordering lessons sends the complete ordered ID list for the course, and the server rewrites positions in one D1 batch. A list that no longer matches the course's lessons is rejected. Blocks move inside the document.
- The server-side draft is the durable draft. Local storage keeps only an unsaved edit of a lesson document, under the [draft-key rules](posts-and-feed.md#composer-and-drafts) with draft kind `course-lesson-doc` and the lesson ID as target.

## Reading and loading

- The course library lists the group's courses that the viewer may see, newest first. Library filtering by level is permitted because the library is not the feed.
- A course read returns the full outline (lesson IDs, titles, goals, positions, published state) plus the documents of the first three visible lessons.
- Further lessons load by ID as the reader advances.
- Learner payloads never include authors' versions or item notes. Editors receive them for editing.

## Feed presence

The first time the owner publishes a course, the API creates one post of type `course` linked to it, authored by the owner. The post carries reactions and ordinary visible comments, appears in strict chronological order at its creation time, and leads to the course from its post page. It is not edited through the composer and cannot be pinned. Unpublishing, republishing, archiving, and restoring never create another post, and a deleted course post is not recreated. Archiving the course leaves the post in place, and the post then shows that the course is unavailable; a course returned to draft is likewise unavailable to everyone but its owner. Comments on the post notify its author like any post response. The [post type rules](posts-and-feed.md#course) own the card.

Courses published before C4 shipped count as already announced and have no course post.

Feed posts about later course changes are future work and will be derived from a course activity log.

## Media

The cover image reuses the [public R2 image pipeline](architecture.md#images) with the [interactive](settings-and-administration.md#image-cropper) wide crop and keys under `courses/`. Replacement and removal clean up superseded objects. Lesson images are described in [lesson documents](#images).

## Deletion and retention

Courses are archived, not hard-deleted. The owner or group creator may archive and restore a course; archived courses are hidden from the library except to the owner and group creator. Restoring returns the course to draft, and archived courses cannot be edited until they are restored. Deleting a lesson is hard deletion and removes its answer threads, replies, reactions, and images. Removing a practice block from a lesson removes its thread at the next publish or discard, after the editor warns the owner. Contributor departure keeps their authored content.

## Deferred

- Speaking practice, speak-and-repeat, and spoken answers. These need an explicit product exception for audio and pronunciation, and a privacy review because browser speech recognition may send audio to the browser vendor.
- Text-to-speech playback and interactive role-play dialogues
- Feed posts for course updates
- Course-specific notifications beyond contributor requests
- A Words tab in the main navigation for practising recently learnt words across courses. Per-member review scheduling would be progress tracking and needs its own product exception under the [no-gamification rule](what_is_it.md#explicit-non-goals); "Practice" is not used as its name because it already means practice blocks.
