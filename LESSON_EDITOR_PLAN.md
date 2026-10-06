# Lesson editor plan (C7)

Working plan for the Notion-style course lesson editor. The rules live in [docs/courses.md](docs/courses.md#lesson-documents); this file holds the delivery steps only and links to the owners instead of restating rules. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed:

- Editor: BlockNote (`@blocknote/core`, `react`, `mantine`; MPL-2.0) with `@blocknote/xl-multi-column` (GPL-3.0, acceptable because the app is private and not distributed). Plate was rejected because its editing UI is Tailwind/shadcn and would have to be rebuilt.
- Lessons use restricted rich text: bold, italic, palette text and background colours, `http`/`https` links. Posts and comments stay plain text.
- One document per lesson in BlockNote's JSON shape, with a draft copy and a published copy. Contributors edit drafts of any lesson; only the owner publishes, discards, and unpublishes.
- No text alignment, no toggle headings, block colours from the inline palette, nesting only for list items (3 levels). Callout variants: hint, important, warning, grammar, culture, false-friend, pronunciation. Any block may sit inside a column.
- Emoji go through a shared Frimousse-based `EmojiPicker` molecule with self-hosted `emojibase-data`, later reused by reactions.
- C7b, C7c, and C7d ship together: the migration removes the per-block routes the current editor and reader use.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C7.0 — Docs and decisions

- [x] Rich-text exception for lessons in `CLAUDE.md`, `docs/product-requirements.md`, `docs/what_is_it.md`, `docs/design-system.md`.
- [x] Lesson documents section in `docs/courses.md`; legacy block sections marked as valid until C7b ships.
- [x] Dependencies and licences in `docs/architecture.md`; rendering and self-hosted asset rules in `docs/security-and-privacy.md`; emoji picker note in `docs/discussions-and-reactions.md`.
- [x] Roadmap phases C7.0–C7g.

## C7.1 — Spike

- [x] BlockNote 0.55 with Mantine 9.7 and React 19.3 in a throwaway worktree (`spike/blocknote`): custom callout, restricted styles, slash menu, two columns, lazy route.
- [x] Findings recorded in `docs/roadmap.md` (C7.1): editor chunk ≈ 232 KB gzipped, BlockNote's unscoped Mantine CSS must be aliased away, default UI features to disable, typography and mobile gutter fixes.
- [ ] Remove the `spike/blocknote` worktree and branch after C7d lands.

## C7a — Contracts

- [x] `@wordinator/contracts/lesson-document`: document schema, inline content, custom blocks, limits, save/publish requests, image upload response.
- [x] Helpers: `walkLessonBlocks`, `mapLessonBlocks`, `collectPracticeIds`, `collectImageUrls`, `mapImageUrls`, `toLearnerDocument`, `findPublishProblems`, `flattenToSteps`, `upgradeLegacyBlocks`, `parseStoredLessonDocument`.
- [x] Contract tests: accepted BlockNote output, every rejection rule, helpers, fixture upgrade.
- [ ] Lesson read response schema (defined with the API in C7b).

## C7b — Migration and lesson API

Migration `0015` (`packages/db`):

- [ ] `course_lessons`: add `draft_doc` (JSON text, not null), `draft_version` (int, default 1), `published_doc` (JSON text, null = unpublished), `published_at`; drop `published` and `version`. `json_valid` checks on both documents.
- [ ] `course_practices (id, group_id, course_id, lesson_id, created_at)`: one anchor per practice block ID, so answer threads keep a real foreign key.
- [ ] `course_media (key, group_id, course_id, lesson_id, created_by, created_at)`: every uploaded lesson image, for ownership checks and cleanup.
- [ ] Data mapping in SQL with `json_group_array`/`json_object`, ordered by position, exactly as `upgradeLegacyBlocks` does: heading → `heading` level 2; text → `paragraph`; example → `example` (sentence as inline text, translation/note as strings); dialogue → `dialogue` (turns as JSON string); practice → `practice` (payload as JSON string). Text containing line breaks stays one block with `\n`.
- [ ] All blocks → `draft_doc`; published blocks of published lessons → `published_doc`; unpublished lessons get `published_doc` NULL.
- [ ] Every practice block → `course_practices` row with the same ID; rebuild `comments` so `block_id` references `course_practices` (cascade delete).
- [ ] Drop `course_blocks`; update `packages/db/src/schema.ts` and Drizzle metadata.
- [ ] Migration test: seed the v1 shape (including the course fixture), migrate, compare each document with `upgradeLegacyBlocks`, check counts, order, publish state, thread links, and that every document parses.
- [ ] Apply locally with an explicit `--local` and inspect the dev data.

API (`apps/api`), every route behind the group middleware and scoped by `group_id`:

- [ ] `GET .../lessons/:lessonId`: learners get the stripped published document with image URLs expanded and no draft; owner and active contributors also get the draft, `draftVersion`, practice references, and last editor. Unpublished lessons stay `404` for learners.
- [ ] Course read returns the outline (publish state derived from `published_doc`) and the first three visible lessons in the new shape.
- [ ] `PUT .../lessons/:lessonId/draft { document, draftVersion }`: owner and active contributors; stale version → `409 VERSION_CONFLICT` with the current draft; every image URL must canonicalize to a `course_media` key of this lesson; practice IDs must not belong to another lesson; new practice IDs get `course_practices` rows; bumps `draft_version`.
- [ ] `POST .../lessons/:lessonId/publish { draftVersion }`: owner only (`403 COURSE_PUBLISH_FORBIDDEN` for contributors); `findPublishProblems` must be empty (`422 LESSON_NOT_READY` with the problems); one D1 batch copies the draft, deletes practices (and threads) in neither document, and deletes `course_media` rows referenced by neither; R2 deletions follow the batch.
- [ ] `POST .../lessons/:lessonId/unpublish` and `POST .../lessons/:lessonId/discard`: owner only.
- [ ] `POST .../lessons/:lessonId/images`: reuses the image pipeline; key `courses/{courseId}/lessons/{lessonId}/{random}`; inserts `course_media`; returns `{ key, url, width, height }`.
- [ ] Remove block create, update, delete, and reorder routes; lesson create/update/reorder/delete keep working with the new columns.
- [ ] Completions and progress treat "published lesson" as `published_doc IS NOT NULL`; `409 LESSON_UNPUBLISHED` and `409 COURSE_ARCHIVED` unchanged.
- [ ] Practice discussion endpoints read the practice from the published document by block ID.
- [ ] Workers tests: tenant isolation for lessons, practices, and image keys from another group or lesson; negative authorization (contributor publish/discard/unpublish, non-member, former contributor, archived course); version conflicts; publish cleanup of threads and media; learner payloads never contain authors' versions or drafts.

Docs: `docs/data-model.md`, `docs/architecture.md` (routes), `docs/courses.md` (fold the legacy block sections into lesson documents).

## C7c — Renderer and player

- [ ] `LessonDocument` organism: renders the JSON with React text nodes only; links get `rel="noopener noreferrer nofollow"` and open in a new tab; colours map to tokens; columns use CSS grid from `column.width` and stack below 48em.
- [ ] Callout molecule: variant → tone token and default icon; `icon` overrides from the contract list.
- [ ] Existing example, dialogue, and practice components render from the new block shapes.
- [ ] Replace the read view in `CourseLessons` and the steps in `LessonPlayer` with `flattenToSteps`; update the C6 player rules in `docs/courses.md`. Coordinate with `MOBILE_PLAN.md` Phase 7 (lesson player).
- [ ] Callout tones, text palette, and column layout tokens in `apps/web/src/tokens.css` and `docs/design-system.md`.
- [ ] Tests: RTL for each block type, escaping of hostile text, unsafe links, columns, and player stepping; existing player and progress Playwright specs pass.

## C7d — Editor core

- [ ] Install pinned BlockNote packages (do not re-resolve the app's `latest` specifiers); Vite alias for `@blocknote/mantine`'s `./mantineStyles.css`; no Inter font import.
- [ ] Lazy-loaded `LessonEditor` organism with the schema limited to the contract types: `createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false })`, styles limited to bold, italic, and colours; hide alignment and nesting controls outside lists.
- [ ] Custom specs: `callout` (variant and icon menu), `example`, `dialogue`, `practice`; dialogue and practice editors reuse the existing `BlockEditor` form pieces inside the block.
- [ ] Slash menu and formatting toolbar limited to allowed items; all labels through i18next.
- [ ] Shared `EmojiPicker` molecule (Frimousse, self-hosted `emojibase-data` via `emojibaseUrl`), wired in place of BlockNote's emoji menu.
- [ ] Editor typography from tokens; narrow-screen side menu gutter.
- [ ] Autosave about 1.5 s after the last change with `draftVersion`; Saved / Saving / Conflict indicator; local backup draft `course-lesson-doc` namespaced by account, group, lesson, and schema version.
- [ ] Publish bar: unpublished changes, last editor; owner sees Publish, Discard, Unpublish; publish problems listed and focusable; warning before publishing removes practices with answers.
- [ ] Conflict handling for now: load the newer draft and keep a copy of the local edit.
- [ ] Remove `BlockEditor` flow, block reorder UI, and block mutations from `apps/web/src/api.ts`.
- [ ] Tests: RTL for autosave, conflict, and contributor without Publish; Playwright: author a lesson with headings, bold and coloured text, callout, and practice, publish, then read it as another member.

## C7e — Images

- [ ] BlockNote `uploadFile` → lesson image endpoint; PNG, JPEG, WebP; size cap from the existing pipeline; optional free-aspect crop with `react-easy-crop`.
- [ ] Alt text field (stored in `name`), caption, preview width.
- [ ] Orphan sweep: `course_media` rows unreferenced by either document and older than 24 h are deleted with their R2 objects (at publish and discard, plus a scheduled sweep if needed).
- [ ] Tests: upload validation, cleanup on publish and discard, rejection of foreign keys.

## C7f — Columns

- [ ] Enable `xl-multi-column`: `multiColumnDropCursor`, `withMultiColumn`, 2- and 3-column slash items, width handles; dictionary merged under `multi_column`.
- [ ] Clamp column count and nesting in the editor so the server never rejects what the editor allowed.
- [ ] Tests: Playwright drag into a column, save, reload round-trip; mobile layout spec covers stacked columns.

## C7g — Merge and polish

- [ ] Block-level three-way merge on `409`: base, local, and server documents compared by block ID; different blocks merge automatically, the same block asks side by side.
- [ ] Paste: strip pasted HTML to allowed styles; pasted images go through the upload flow.
- [ ] Tests: merge cases (move vs edit, delete vs edit, both edit), Playwright with two editors.

## Release (after C7d, again after later phases)

- [ ] On the release branch: type-check, Vitest, RTL, Playwright, production builds for web and API.
- [ ] Back up or export production D1.
- [ ] Apply migration `0015` with an explicit `--remote`.
- [ ] Deploy the API, then the web app.
- [ ] Smoke test: an existing lesson reads correctly, an existing practice thread still opens, progress counts are unchanged.
- [ ] Final docs pass: `docs/data-model.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/testing.md`, `docs/user-flows.md`, `docs/roadmap.md`.
