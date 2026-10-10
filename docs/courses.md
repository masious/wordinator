# Courses

## Global library routing

Courses are the sole organizational layer above lessons in one installation-wide library. Reader routes are `/courses`, `/courses/:courseSlug`, and `/courses/:courseSlug/lessons/:lessonSlug` (see [readable URLs](#readable-urls)); they contain no group or language-workspace namespace. Legacy web URLs under `/groups/:groupId/courses/...` redirect to the matching global route, the old journal, post, and notices pages redirect to `/journal`, `/journal/:postId`, and `/notifications`, and retired member pages redirect to `/courses`. Course feed cards appear in the global journal. Historical group-scoped API paths remain a storage-compatibility detail during migration and do not define product tenancy. In a site-wide library the course progress panel shows only the viewer's own progress. Course contributors (ask to contribute, owner acceptance) remain, because they belong to a course rather than to a workspace.

### Readable URLs

Courses and lessons are addressed by slugs, not IDs: `/courses/dutch-foundations-part-ii-everyday-life/lessons/mijn-dag`.

- A slug is derived from the title when the course or lesson is created (`slugify` in the shared contracts): accents fold to plain letters, `ß` becomes `ss`, everything else that is not a letter or digit becomes a dash, and it is capped at 60 characters. A title with nothing usable gets `course` or `lesson`.
- A course slug is unique in the library and a lesson slug is unique within its course. A repeated title takes the next free numbered variant (`im-cafe-2`).
- Slugs never change, not even when the title does, so shared links keep working.
- `GET .../course-refs/:courseRef?lesson=:lessonRef` resolves either a slug or an ID to IDs and canonical slugs. It applies the same visibility as the course and lesson reads, so a slug never reveals a draft course or an unpublished lesson. The web resolves the segment in the route loader and keeps using IDs for every API call.
- An ID-based link (from older notifications, course feed cards, or bookmarks) redirects to the slug URL.
- Migration `0021_course_slugs.sql` backfilled existing rows with the same folding where SQLite allows it; a title with any other character falls back to `course-<id prefix>`, and a repeated title keeps its plain slug on the oldest row and takes a short ID suffix on the others. The content tool (`content/dutch-foundations/tools/lesson.ts sql`) writes slugs the same way and never changes an existing row's slug.

Status: delivered. C1 (course shell), C2 (lessons and content blocks), C3 (practice blocks; answer threads retired by [practice progress](#practice-answers)), C4 (feed presence), C5 (contributors), C6 (lesson player and progress), C6b (lesson positions), C7 (lesson editor; see [lesson documents](#lesson-documents)), and C8 (new words and recap; see [new words](#new-words-and-recap)) are complete. C9 ([word bookmarks and the Words tab](words.md)) is approved and planned. Delivery phases live in the [roadmap](roadmap.md#course-phases).

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

Any active member may create a course. Draft courses are visible only to their owner and contributors. The owner also edits the course's [dialogue voices](speech.md#dialogue-cast) with its details.

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
- A lesson document is `{ schemaVersion: 2, blocks }` and every block follows BlockNote's own JSON convention: `{ id, type, props, content, children }`. Block IDs are stable and identify practice progress and merge units.
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
- Publishing deletes the progress of practices in neither document, after the editor warns the owner when anyone has started one of them, and deletes R2 images referenced by neither document under the [image rules](#images).
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

Delivered in C8 (2026-10-08). Lessons introduce vocabulary explicitly, each player step shows the words it introduces, and a learner can review every word from the lessons they have finished. C8 builds on [lesson documents](#lesson-documents). [Word bookmarks and the Words tab](words.md) (C9) build on it.

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
| `ipa` | no | 100 | [Pronunciation override](speech.md#pronunciation-override) of the term: IPA letters and diacritics, stress and length marks, `.`, and spaces only. Never shown to learners |

- All fields are plain text. Gender, word class, and grammar are written into `term`, `forms`, or `note`; they are not separate fields.
- A block holds 1–50 words. Drafts may hold words with an empty term or meaning; publishing requires both (a `word-empty` publish problem that names the block and the word).
- The block is top level or inside a column, like any other leaf block. Adding the block type does not change the document schema version.
- Learners receive the whole word, including the note. It is not concealed, only shortened: a New words list shows each word's term, forms, and meaning, and a Show more button under a word with an example or note opens them (Show less closes them). Each list starts closed.
- The lesson reader renders the block as a compact word list in place.
- Authors add the block with the "New words" slash item, which starts it with one empty word. The block's form edits each word's term and meaning, shows forms, example, note, and pronunciation (IPA) on request (rows that already have one start expanded), shows each word's [audio status](speech.md#playback), and adds, removes (never the last word), and reorders words. An IPA the contracts refuse stays in its field with a message and is not saved until it is valid. New words get IDs from `crypto.randomUUID()`.
- A pasted or duplicated block would repeat word IDs, which the document's unique-ID check refuses, so the editor gives the later block's repeated words fresh IDs before saving. The first use of an ID in document order keeps it.
- The publish bar lists each `word-empty` problem; choosing one focuses that word's empty term, or else its meaning.
- A published document written directly in the database (outside the publish route) also needs its `course_lesson_words` rows, which only the publish route maintains.

### Words in the player

A vocabulary block is not a step of its own. Its words appear in a New words panel on the step built from the block directly before it in the same heading section:

- After paragraphs, lists, images, or dividers, it ends that prose step and attaches to it. Prose that follows starts a new step.
- After an example or a callout, it attaches to that step.
- After a practice, it attaches to every item of that block, so the words stay visible throughout.
- After a dialogue, each word shows only on the first turn that uses it, so lines do not reveal words before they are spoken. A turn uses a word when one of its sentences holds the tokens of the word's term or of one of its forms (split on `·`, `,`, `;`, `/`), in order, ignoring articles and reflexive pronouns. Tokens match exactly, or as inflections sharing a stem of at least four letters with at most three further letters on either side (`check`/`checkt`, `stappen`/`stapt`). Order keeps a separable verb's particle after its verb, so `in Amsterdam stappen we over` does not count as `stapt in`. Words no turn uses show on the last turn. The same applies to words that reach a dialogue from earlier in its section.
- With no preceding step in the section (first after a heading or at the start of the lesson), it attaches to the next step: to every item when that step comes from a practice, or to a dialogue's turns as above. A section with no other step shows the words as a step of their own, identified by its first vocabulary block. Blank paragraphs are not steps and do not break these rules.
- Consecutive vocabulary blocks combine into one panel in document order.
- Inside a column list read as one step, the words show in place; that step still carries them for the lesson recap. A column list read block by block applies these rules in leaf order.

### Word recap

- Recap shows pages of [word cards](words.md#word-cards) (C9a) in the player shell: as many as fit without scrolling, each flipping in place to its meaning, example, and note. Nothing is graded, recorded, or counted. C9b adds [bookmarks](words.md#bookmarks) to the cards and the New words lists.
- **Lesson recap:** the player's completion screen offers Review words when the run had words. It uses the words of that run, once each in step order, so previews work too. Back to the summary returns to the completion screen.
- **Course recap:** the course page offers Review words, with the word count, to a member who has finished at least one published lesson with words. It covers the currently published lessons the viewer has [finished](#progress), in lesson order and then document order. A term repeated across lessons (compared trimmed and case-insensitively) shows once, at its first occurrence.
- The course recap follows course visibility: archived courses offer no recap except to those who can still see them.
- The course recap reads the [`course_lesson_words`](data-model.md#course_lesson_words) index through `GET /groups/:groupId/courses/:courseId/words`, which proves membership and scopes by `group_id`.

## Practice answers

Answers are private and not graded. A sentence can have several valid translations, so the private answer check below confirms a match with the author's version, or shows that version as a reference; it never marks an answer wrong.

- **Practice progress** (approved product change, 2026-10-10). Answers are never shared, and there is no answer thread, reveal, reply, or reaction. Practice answer threads (C3) are retired: migration `0022_course_practice_progress.sql` turned each shared answer set into its author's progress and deleted the threads. Learners may change their answers to match the author's version or leave them as they are; either way only the count matters.
- The server stores, per learner and practice, only how many of its questions have an answer (blank or whitespace-only answers do not count). The answers themselves live in the learner's local draft with draft kind `practice-answer` and the block ID as target, so a learner can come back and change them on the same device. Saving keeps the highest count received, so opening the practice on a device without the draft never lowers it.
- A learner is done with a practice when their count reaches its current number of questions. Adding questions to a published practice moves people back from done until they answer the new ones.
- Progress is saved when the learner closes the [answer dialog](#lesson-pages), whether with its button or its close control, and when the [player](#lesson-player-and-progress) leaves a question step or closes. Nothing is saved while no question has an answer and nothing was saved before. Only practices in the published document record progress; editors' draft previews record nothing, and archived courses refuse it.
- `PUT .../lessons/:lessonId/blocks/:blockId/progress` takes `{ answered }` (at most the practice's number of questions) and answers with the practice's progress. Lesson reads carry `practiceProgress` per practice: `done` (people who are done), `started` (people with any saved count), and `answered` (the viewer's own count, or null).
- There is no pinning and no score. Answering is never required to finish a lesson; [progress](#lesson-player-and-progress) counts finished lessons, not practices.
- **Answer check** (approved product change, 2026-10-08). Pressing Enter in an item's answer field checks that answer against the item's author's version through the API. A match shows a brief animated "Matches the author's version" confirmation, and editing the answer clears it. A miss shows the author's version as a reference, with a reminder that the answer can still be right because a sentence can be translated in several ways; it stays while the learner edits, until the next check. The API returns the version only for a miss, and an item with no author's version shows nothing on a miss. Shift+Enter adds a line break. Checks are never stored, never shown to others, and never count toward progress. The answer check is the only place a learner sees an author's version; item notes are shown only to editors.
- Matching ignores case, punctuation, quote style, and spacing. An open item matches its single author's version. A fill-in item matches either its blank entries in order or the whole prompt with its blanks filled; an item with no author's version, or with any blank left without one, never matches.
- A fill-in item with more than one blank is answered in one field per blank. Enter in a blank moves to the next blank, and Enter in the last blank checks the item. The blanks are kept as one item answer joined by ` · `, the separator the author's version list uses, so a draft keeps one entry per item.
- Practice activity creates no notifications.

## Lesson player and progress

Approved product change (C6): a light, non-competitive layer of progress on top of courses.

### Lesson player

The course page has one player action, in a progress card at the top of the page, above Manage course. The card shows the viewer's own course percentage with a progress bar and a single button; lessons have no start actions of their own and only show Finished or their saved step. The button picks its lesson in this order:

1. **Continue lesson** — the viewer's most recently moved unfinished lesson, reopened at its saved step (see [lesson positions](#lesson-positions)).
2. **Start lesson** — otherwise the first lesson in the outline the viewer has not finished.
3. **Practise again** — otherwise, when every lesson is finished, the first lesson.

Only published lessons are chosen while the course has any; an editor's unpublished lesson is chosen only when nothing is published, and then plays as a preview, which the card says: it starts from the beginning and saves no place or progress. Editors still read unpublished drafts on the [lesson page](#lesson-pages) as previews.

The player is focused and step-by-step, with a progress bar and a step counter. Below `48em` the player is a full-screen sheet.

- Steps come from the published document in order (`flattenToSteps` in the contracts). A `heading` is not a step; it labels the steps that follow it. The first step under a heading shows it as the stage's title, and later steps in that section show it as a small section label. A dialogue's lines share the title of the line that opens it.
- Consecutive prose under one heading (paragraphs, list items, images, and dividers) is one step. Dividers and blank paragraphs only space prose out: they never make a step on their own and are trimmed from the start and end of a prose step. A `callout` and an `example` are one step each. An example shows its translation and note with the sentence.
- A column list without dialogue or practice is one step, laid out as in the reader. A column list containing dialogue or practice is read column by column, block by block, with the rules above.
- Each `dialogue` turn is a step: lines appear one after another, earlier lines stay visible and muted, and the newest line is emphasized.
- Each `practice` item is a step that asks one question with one answer field. The instruction stays visible, and a passage is collapsible and open on the first item. Answers use the same local `practice-answer` draft as the lesson page's answer dialog, so either surface can continue a set. Leaving a question step, or closing the player, saves the practice's [progress](#practice-answers); there is nothing to share.
- Steps are fixed when a run starts; a refetch during the run never moves the learner. Back and Next move freely. There is no timer and nothing is marked wrong; the [answer check](#practice-answers) confirms a match or shows the author's version as a reference. Next and Enter are one action: Enter outside a field or button acts as Next, and the player opens with Next focused, so pressing Enter repeatedly walks through the lesson. In a question step with a filled answer that has not been checked, Next (or Enter in the answer field) checks it and shows the feedback first, and the next press moves on; an empty or already-checked answer moves on at once.
- A published lesson the learner has started opens at their [saved step](#lesson-positions) with a Picked up where you left off note and a Start over action. Previews always start at the first step.
- After the last step the player shows a completion screen with the learner's course percentage and offers the next lesson or a return to the course.
- Owners and contributors can run unpublished lessons as a preview. Previews never count toward progress, and the completion screen says so.

### Progress

- Finishing a published lesson in the player records one completion per member and lesson. Repeating the lesson keeps the first completion. Reading the lesson page alone does not record anything.
- A member's course progress is the share of the currently published lessons they have worked through, as a whole percentage rounded down. Every published lesson weighs the same: a finished lesson counts whole, a started lesson counts as the furthest share of its steps the member has passed (see [lesson positions](#lesson-positions)), and an untouched lesson counts nothing. Unpublishing a lesson removes it from every count; republishing restores it. Editing a finished lesson does not reset it. Deleting a lesson deletes its completions and positions.
- The course page shows a Progress panel, visible to everyone who can see the course, listing every active group member with their percentage and `completed of total` finished lessons. Members are listed by name, never ranked. The panel is hidden while the course has no published lessons or is archived.
- The course page's lesson list marks the viewer's finished lessons with a check.
- Former members disappear from the panel; their completions stay stored and reappear if they rejoin.
- Archived courses refuse new completions (`409 COURSE_ARCHIVED`), and unpublished lessons refuse them (`409 LESSON_UNPUBLISHED`).
- Progress creates no notifications and no feed posts.

### Lesson positions

Approved product change (C6b): the player remembers where a member stopped, so they can resume and so a started lesson counts in part toward progress. It stays inside the C6 progress exception and adds nothing competitive.

- Each move in the player of a published lesson saves the step now shown as the member's position in that lesson; opening the player alone saves nothing. Previews never save positions.
- A step is identified by its block ID, plus the dialogue line or practice item number inside it. Edits elsewhere in the lesson move the step's number but not its identity. When the step's block is gone, the player falls back to the saved step number, clamped to the lesson. The API resolves the key against the published document and refuses a key it cannot find (`409 LESSON_STEP_NOT_FOUND`); the player ignores that refusal.
- The passed share is the number of steps before the step shown, of the lesson's current step count, so the last step shown is still short of finishing. It never shrinks when the member steps back; when an edit shortens the lesson it is capped below the new count. Only Finish lesson counts the lesson whole.
- Finishing a lesson deletes its position. Practising a finished lesson again saves a new position for resuming, which never adds progress.
- The course page's progress card offers Pick up where you left off with Continue lesson for the member's most recently moved unfinished lesson, each started lesson shows its saved step, and progress refreshes when the player closes.
- A position is private to its member. Other members see only the resulting percentage in the Progress panel.
- Archived courses refuse positions (`409 COURSE_ARCHIVED`), unpublished lessons refuse them (`409 LESSON_UNPUBLISHED` for editors; `404` for readers, who cannot see them). Positions in unpublished lessons stay stored but do not count or show until the lesson is published again.
- New step kinds (such as C8's `words` step) must give their steps a stable key in `lessonStepKey`.

### Lesson overview (prototype)

Experimental, not an approved product change. A design prototype at `/overview/<lesson-file-slug>` (for example `/overview/07-a-mijn-dag`) shows one lesson as a winding road of stops so a member can see how far they are and what remains before the lesson is finished. Below 48em the road winds down one lane with cards beside it; wider screens lay it out as a board of two to four columns that the road snakes across, turning in the page margin at each row end, with seeded (stable) bends and offsets so it looks hand-drawn rather than gridded. It is registered only in development builds: it reads authored lesson files straight from `content/` (normalized with `content/dutch-foundations/tools/normalize.ts` and validated with `lessonDocumentSchema`), and production builds bundle no lesson file and answer `404`.

- **Stops.** One stop per heading section that has player steps. Level-3 headings are stops inside their level-1 or level-2 chapter, and a chapter with more than one stop gets a banner on the road (a tag above its first stop on the board). A stop is a Story (it has a dialogue), Practice, Reading (a practice with a passage), or Topic, and is collapsed to its title on one line. Hovering or focusing a stop opens its card over its neighbours, with a short reveal, without moving the road; the current stop stays open, and on touch screens a tap opens the slider directly. The open card shows a one-line teaser (the instruction, the scene, or the section's grammar or important callout), its step, line, question, and new-word counts, and its first few terms.
- **Progress.** Progress is a step index, the same unit as [lesson positions](#lesson-positions): stops before it are Completed, the stop that holds it is Up next or In progress (with a ring for its share of steps), and later stops are Ahead. The road is coloured up to the current stop and ends at a finish line. The page header shows the lesson percentage and covered sections, steps, new words, and questions.
- **Slider.** Opening a stop shows the [lesson player](#lesson-player)'s stage (`StepStage`) for that stop's steps only. Moving past the furthest step advances progress; reviewing a finished stop or previewing one ahead changes nothing. Practice answers stay in the dialog's local draft and record no practice progress.
- **Zigzag variation.** A second, desktop-only prototype at `/2overview/<lesson-file-slug>` takes the same lesson files, stops, statuses, and `step` parameter, and fits the whole page in one screen height. The lesson is a thick, looping trail that starts in the top-left corner and works down the left of the page in horizontal bands: each band crosses the width as a run of round loops that swing down and curl back on themselves, then turns round the side into the next band, which runs the other way. Stops are coin-sized nodes at even distances along it, nudged along the trail where it crosses itself so no two overlap; the current one is larger, and its title shows with the selected and hovered or focused stops. Each stop has a specific category, shown as one of [Noto's animated emoji](https://googlefonts.github.io/noto-emoji-animation/) on a node washed in a [vivid accent](design-system.md#color-tokens) tone and ringed in it, with a check badge once finished; the start and finish are 🚩 and 🏆. At rest a node shows Noto's still artwork; the current stop and a hovered or focused stop load and loop the Lottie animation (with `lottie-web`, loaded only by this page), the finish plays once the lesson is complete, and reduced motion keeps every emoji still. The section panel's eyebrow shows the stop's emoji still, and its Section complete screen shows the emoji animated in place of the check. The artwork and animations are saved in the repository (`apps/web/src/organisms/LessonOverview/noto/`, with their source in its README) and served from Wordinator's own origin, as [security and privacy](security-and-privacy.md) requires; like the lesson files, only development builds include them. If the artwork cannot load, the plain emoji character shows instead. The licence and attribution terms of Noto Animated Emoji must be confirmed before any production use. Explanation stops are Introduction (the lesson's first stop), Story (has a dialogue), Summary (titled Summary, Recap, or Review), Grammar (a grammar callout or a column table), Pronunciation, Culture (their callouts), Words (has new words), or Topic. Practices have no type of their own, so they are read from the instruction's opening: Translate, Conversation (completing a conversation or dialogue), Word order (put the words in order), Rewrite (rewrite or make), Writing (write, except drills such as Write the plural), Reading (has a passage), or Fill in. `?icons=icons` swaps the emoji for line icons on nodes filled with the tone, for comparison. Only emoji that Noto animates are used: Introduction 👋, Topic 💡, Grammar ⚙️, Words 🧠, Pronunciation 🗣️, Culture 🌍, Story 🎭, Summary ✅, Fill in ✏️, Conversation 💬, Translate 🤝, Word order 🎲, Rewrite 🪄, Reading 📚, Writing ✍️. A compact summary (title, percentage, sections, new words, questions, and the progress control) sits top right on the page background, not in a card. The open stop plays in a panel docked in the bottom-right corner instead of a dialog; a long step grows the panel up over the summary. The panel opens on the current stop and can be collapsed to an Up next prompt. Steps in that panel leave out their New words box: a round button in the bottom-left corner opens a New words drawer with the [lesson words panel](#lesson-pages)'s list (term, forms, meaning, pronunciation, bookmark) for the whole lesson. Words on the step on stage are highlighted and scrolled into view, words not reached yet are dimmed, and while the drawer is closed the button counts the words on the current step. A words-only step points to the drawer instead of repeating the list.
- **Prototype only.** Progress is simulated through the `step` search parameter and a floating range control; nothing is saved. Before it ships it needs an approved product decision, a place on (or beside) the [lesson page](#lesson-pages), data from the lesson read and position APIs, and the usual tests.

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

- Course details and lessons are saved through their own endpoints. There is no whole-course save. The course details include the [dialogue cast](speech.md#dialogue-cast), owner only.
- A lesson's content is saved as its whole draft document, autosaved by the editor under the [drafts and publishing](#drafts-and-publishing) rules. Lesson title and goal are saved separately and carry no version.
- Reordering lessons sends the complete ordered ID list for the course, and the server rewrites positions in one D1 batch. A list that no longer matches the course's lessons is rejected. Blocks move inside the document.
- The server-side draft is the durable draft. Local storage keeps only an unsaved edit of a lesson document, under the [draft-key rules](posts-and-feed.md#composer-and-drafts) with draft kind `course-lesson-doc` and the lesson ID as target.

## Lesson pages

Approved product change (2026-10-08): each lesson has its own page, and the course page no longer shows lesson content.

- **Course page.** Below the course header, progress card, management, progress, and contributors, the course page lists every visible lesson in order: derived number (a check once the viewer has finished it), title, goal, and Finished or the saved step. Each entry links to the lesson page. Owners and contributors also see the Unpublished and Unpublished changes labels there, and the lesson tools that need no document: Edit details, Move up and Move down, and Delete, under the usual [permissions](#contributors-and-publishing). Add lesson stays on the course page and opens the new lesson's page. The course word recap stays on the course page.
- **Lesson page.** `/courses/$courseSlug/lessons/$lessonSlug` shows one lesson: a link back to the course, the derived lesson number, title, goal, and Finished or the saved step, the published document (an editor's draft preview for an unpublished lesson), and links to the previous and next lessons. Owners and contributors edit the content there with Edit lesson. A lesson the viewer cannot see, or one outside the course, shows This lesson is not available. Reading the page records nothing.
- **Practice on the lesson page.** A practice block is not answered inline. Its eyebrow row shows Practice beside its [progress](#practice-answers): how many people are done (Nobody done yet, 1 person done, N people done) and the viewer's own state (N questions left, or You’re done). Below the instruction it lists at most its first three prompts, in body size with tight spacing, and an “and N more questions” note when it has more, with the Answer button at the bottom right beside them (below them on narrow phones). Answer opens a dialog with the instruction, any reading passage, and one answer field per question, restored from the local draft. Its button reads Finish later while any question is blank and Done once every question has an answer; both close the dialog, and closing it in any way saves progress. When the lesson has a New words panel and the screen is at least `64em` wide, the dialog is [docked](design-system.md) over the reading column instead of centred, so the panel stays visible and usable beside it; it has no backdrop, and a click outside does not close it. Narrower screens centre it, and below `48em` it is full screen.
- **New words on the lesson page.** New words blocks are not shown in the text. Every new word of the lesson is listed once in a New words panel beside the text (term, forms, meaning), in the order the player introduces them. A word is highlighted while the block that introduces it is on screen, using the same attachment as the [player](#words-in-the-player): a word belongs to the block before its New words block, a dialogue's words to the dialogue, and words with nothing before them in their section to the step next to them. Above `64em` the panel sticks beside the text just below the navigation bar, and blocks under the bar do not count as on screen. When the highlighted words are not already in the panel's view, it scrolls to them, centred when they fit and otherwise from the first of them; narrower screens show it as an unhighlighted list after the text. Vocabulary blocks still feed the player, the recaps, and the word index unchanged.
- The player stays on the course page's progress card.

## Reading and loading

- The course library lists the group's courses that the viewer may see, newest first. Library filtering by level is permitted because the library is not the feed.
- A course read returns the full outline (lesson IDs, titles, goals, positions, published state) plus the documents of the first three visible lessons.
- The lesson page and the player read further lessons by ID (`GET .../lessons/:lessonId`), reusing a lesson the course read already returned.
- Learner payloads never include authors' versions or item notes. Editors receive them for editing.

## Feed presence

The first time the owner publishes a course, the API creates one post of type `course` linked to it, authored by the owner. The post carries reactions and ordinary visible comments, appears in strict chronological order at its creation time, and leads to the course from its post page. It is not edited through the composer and cannot be pinned. Unpublishing, republishing, archiving, and restoring never create another post, and a deleted course post is not recreated. Archiving the course leaves the post in place, and the post then shows that the course is unavailable; a course returned to draft is likewise unavailable to everyone but its owner. Comments on the post notify its author like any post response. The [post type rules](posts-and-feed.md#course) own the card.

Courses published before C4 shipped count as already announced and have no course post.

Feed posts about later course changes are future work and will be derived from a course activity log.

## Media

The cover image reuses the [public R2 image pipeline](architecture.md#images) with the [interactive](settings-and-administration.md#image-cropper) wide crop and keys under `courses/`. Replacement and removal clean up superseded objects. Lesson images are described in [lesson documents](#images).

## Deletion and retention

Courses are archived, not hard-deleted. The owner or group creator may archive and restore a course; archived courses are hidden from the library except to the owner and group creator. Restoring returns the course to draft, and archived courses cannot be edited until they are restored. Deleting a lesson is hard deletion and removes its practice progress and images. Removing a practice block from a lesson removes its progress at the next publish or discard, after the editor warns the owner when anyone has started it. Contributor departure keeps their authored content.

## Deferred

- Speaking practice, speak-and-repeat, and spoken answers. These need an explicit product exception for audio and pronunciation, and a privacy review because browser speech recognition may send audio to the browser vendor.
- Interactive role-play dialogues. Text-to-speech playback is [lesson speech](speech.md) (C10).
- Feed posts for course updates
- Course-specific notifications beyond contributor requests
- Review scheduling for bookmarked words in the [Words tab](words.md#words-tab)
