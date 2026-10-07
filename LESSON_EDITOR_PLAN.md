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
- [x] Lesson read response schema (defined with the API in C7b).

## C7b — Migration and lesson API

Migration `0015` (`packages/db`):

- [x] `course_lessons`: add `draft_doc` (JSON text, not null), `draft_version` (int, default 1), `published_doc` (JSON text, null = unpublished), `published_at`; drop `published` and `version`. `json_valid` checks on both documents.
- [x] `course_practices (id, group_id, course_id, lesson_id, created_at)`: one anchor per practice block ID, so answer threads keep a real foreign key.
- [x] `course_media (key, group_id, course_id, lesson_id, created_by, created_at)`: every uploaded lesson image, for ownership checks and cleanup.
- [x] Data mapping in SQL with `json_group_array`/`json_object`, ordered by position, exactly as `upgradeLegacyBlocks` does: heading → `heading` level 2; text → `paragraph`; example → `example` (sentence as inline text, translation/note as strings); dialogue → `dialogue` (turns as JSON string); practice → `practice` (payload as JSON string). Text containing line breaks stays one block with `\n`.
- [x] All blocks → `draft_doc`; published blocks of published lessons → `published_doc`; unpublished lessons get `published_doc` NULL.
- [x] Every practice block → `course_practices` row with the same ID; rebuild `comments` so `block_id` references `course_practices` (cascade delete).
- [x] Drop `course_blocks`; update `packages/db/src/schema.ts` and Drizzle metadata.
- [x] Migration test: seed the v1 shape (including the course fixture), migrate, compare each document with `upgradeLegacyBlocks`, check counts, order, publish state, thread links, and that every document parses.
- [x] Apply locally with an explicit `--local` and inspect the dev data.

API (`apps/api`), every route behind the group middleware and scoped by `group_id`:

- [x] `GET .../lessons/:lessonId`: learners get the stripped published document with image URLs expanded and no draft; owner and active contributors also get the draft, `draftVersion`, practice references, and last editor. Unpublished lessons stay `404` for learners.
- [x] Course read returns the outline (publish state derived from `published_doc`) and the first three visible lessons in the new shape.
- [x] `PUT .../lessons/:lessonId/draft { document, draftVersion }`: owner and active contributors; stale version → `409 VERSION_CONFLICT` with the current draft; every image URL must canonicalize to a `course_media` key of this lesson; practice IDs must not belong to another lesson; new practice IDs get `course_practices` rows; bumps `draft_version`.
- [x] `POST .../lessons/:lessonId/publish { draftVersion }`: owner only (`403 COURSE_PUBLISH_FORBIDDEN` for contributors); `findPublishProblems` must be empty (`422 LESSON_NOT_READY` with the problems); one D1 batch copies the draft, deletes practices (and threads) in neither document, and deletes `course_media` rows referenced by neither; R2 deletions follow the batch.
- [x] `POST .../lessons/:lessonId/unpublish` and `POST .../lessons/:lessonId/discard`: owner only.
- [x] `POST .../lessons/:lessonId/images`: reuses the image pipeline; key `courses/{courseId}/lessons/{lessonId}/{random}`; inserts `course_media`; returns `{ key, url, width, height }`.
- [x] Remove block create, update, delete, and reorder routes; lesson create/update/reorder/delete keep working with the new columns.
- [x] Completions and progress treat "published lesson" as `published_doc IS NOT NULL`; `409 LESSON_UNPUBLISHED` and `409 COURSE_ARCHIVED` unchanged.
- [x] Practice discussion endpoints read the practice from the published document by block ID.
- [x] Workers tests: tenant isolation for lessons, practices, and image keys from another group or lesson; negative authorization (contributor publish/discard/unpublish, non-member, former contributor, archived course); version conflicts; publish cleanup of threads and media; learner payloads never contain authors' versions or drafts.

Docs: `docs/data-model.md`, `docs/architecture.md` (routes), `docs/courses.md` (fold the legacy block sections into lesson documents). **Not done yet.**

Progress notes (2026-10-06):

- C7b API and migration are complete and verified: API Vitest 65 tests, R2 suite 3 tests (lesson image upload, foreign-key rejection, cleanup), API type-check, and `0015` applied with `--local` (2 dev lessons; all documents parse). Decisions taken: lesson details (title, goal) are edited without a version; contributors may change details only of unpublished lessons (`COURSE_CONTENT_PUBLISHED`); publish/discard cleanup removes only media older than 24 h so in-flight uploads survive; `discard` on an unpublished lesson returns `409 LESSON_UNPUBLISHED`; draft saves accept up to 300 KB bodies.
- C7c/C7d web code is written and the production bundle builds (editor chunk ≈ 242 KB gzipped, lazy; Emojibase self-hosted under `/emojibase/en/`). Non-test web code type-checks. Not yet run or fixed: `CourseLessons.test.tsx` and `PracticeBlock.test.tsx` still use the removed block types; no new RTL tests; no Playwright run; the editor has not been exercised in a real browser. BlockNote's own control tooltips still come from its English dictionary; Wordinator's slash items, block types, placeholders, and custom blocks go through i18next.
- Doc updates for C7b–C7d are still pending (see the Docs line above and C7c player rules).

Progress notes (2026-10-07):

- Web type-check clean; web Vitest 20 files / 77 tests before the new editor tests, then 13 editor tests added (all pass). BlockNote runs in jsdom, so editor flows are covered by RTL. API Vitest 65 tests and R2 suite 4 tests pass.
- BlockNote warns that the viewport meta lacks `interactive-widget=resizes-content`; left unchanged because the post composer already rides above the keyboard with `visualViewport`, and the global switch would change that behaviour. Revisit with a real-device check.
- C7e: react-easy-crop has no free-aspect mode, so the lesson image dialog offers aspect presets (whole image by default, 4:3, 16:9, 1:1, 3:4). Images are always re-encoded client-side (metadata stripped, longest edge capped, quality lowered until under the 1 MB server cap). The Embed tab is removed because the API accepts only this lesson's uploads.
- C7e is code complete and documented (`docs/courses.md#images`, `architecture.md`, `security-and-privacy.md`, `operations.md`, `testing.md`, `roadmap.md`). Verified: workspace type-check; contracts 22, db 4, API 65, R2 4, web 23 files / 86+ tests; production builds (editor chunk ≈ 248 KB gzipped, lazy; it now includes `xl-multi-column` because the dictionary imports its locale). Course Playwright specs (contributors, practice, progress, images) pass in Chromium and WebKit.
- The full Playwright suite could not be verified: another local session ran Playwright concurrently against the same ports and `.wrangler/e2e` database, which reset data and stopped the shared dev server mid-run. Re-run the whole suite when nothing else uses those ports; failures seen during the interference (visual baselines, mobile layout, phase specs) are unconfirmed.
- Docs for C7b–C7d (data model, routes, legacy block sections in `courses.md`, C6 player rules) are still pending.

## C7c — Renderer and player

- [x] `LessonDocument` organism: renders the JSON with React text nodes only; links get `rel="noopener noreferrer nofollow"` and open in a new tab; colours map to tokens; columns use CSS grid from `column.width` and stack below 48em.
- [x] Callout molecule: variant → tone token and default icon; `icon` overrides from the contract list.
- [x] Existing example, dialogue, and practice components render from the new block shapes.
- [~] Replace the read view in `CourseLessons` and the steps in `LessonPlayer` with `flattenToSteps` (code done and covered by RTL); update the C6 player rules in `docs/courses.md` (docs pending). Coordinate with `MOBILE_PLAN.md` Phase 7 (lesson player).
- [x] Callout tones, text palette, and column layout tokens in `apps/web/src/tokens.css` and `docs/design-system.md`.
- [x] Tests: RTL for each block type, escaping of hostile text, unsafe links, columns, and player stepping (done: `LessonDocument.test.tsx`, `CourseLessons.test.tsx`, `PracticeBlock.test.tsx` rewritten); existing player and progress Playwright specs pass (`course-progress` and `course-practice` reseeded through draft and publish via `e2e/lessonSeed.ts`; both, and `course-feed`, pass in Chromium and WebKit).

## C7d — Editor core

- [x] Install pinned BlockNote packages (do not re-resolve the app's `latest` specifiers); Vite alias for `@blocknote/mantine`'s `./mantineStyles.css`; no Inter font import.
- [x] Lazy-loaded `LessonEditor` organism with the schema limited to the contract types: `createHeadingBlockSpec({ levels: [1, 2, 3], allowToggleHeadings: false })`, styles limited to bold, italic, and colours; hide alignment and nesting controls outside lists.
- [x] Custom specs: `callout` (variant and icon menu), `example`, `dialogue`, `practice`; dialogue and practice editors reuse the existing `BlockEditor` form pieces inside the block.
- [x] Slash menu and formatting toolbar limited to allowed items; all labels through i18next, including BlockNote's own controls (`editorDictionary.ts`, tested).
- [x] Shared `EmojiPicker` molecule (Frimousse, self-hosted `emojibase-data` via `emojibaseUrl`), wired in place of BlockNote's emoji menu.
- [~] Editor typography from tokens; narrow-screen side menu gutter.
- [x] Autosave about 1.5 s after the last change with `draftVersion`; Saved / Saving / Conflict indicator; local backup draft `course-lesson-doc` namespaced by account, group, lesson, and schema version.
- [x] Publish bar: unpublished changes, last editor; owner sees Publish, Discard, Unpublish; publish problems listed and focusable; warning before publishing removes practices with answers.
- [x] Conflict handling for now: load the newer draft and keep a copy of the local edit.
- [x] Remove `BlockEditor` flow, block reorder UI, and block mutations from `apps/web/src/api.ts`.
- [~] Tests: RTL for autosave, conflict, and contributor without Publish (done: `useLessonAutosave.test.tsx`, `LessonEditor.test.tsx`, `PracticeFields.test.tsx`); Playwright: `course-contributors.spec.ts` now drives the real editor (contributor edits and autosaves without Publish, owner publishes, reader sees it) and passes in Chromium and WebKit; still to write: author a lesson with headings, bold and coloured text, callout, and practice, publish, then read it as another member.

## C7e — Images

- [x] BlockNote `uploadFile` → lesson image endpoint through `LessonImageDialog`; any browser-decodable image is re-encoded to JPEG under the existing 1 MB cap; optional crop with `react-easy-crop` using aspect presets (whole, 4:3, 16:9, square, 3:4) because the library has no free aspect. Upload-only file panel (no link tab).
- [x] Alt text (stored in `name`, starts empty, required to publish), caption, replace, and delete from the image toolbar; preview width from resize handles, rounded to whole pixels.
- [x] Orphan sweep: `course_media` rows unreferenced by either document and older than 24 h are deleted with their R2 objects at publish and discard, plus a daily cron sweep (`sweepLessonMedia`, `triggers.crons` in `apps/api/wrangler.jsonc`).
- [x] Tests: upload validation, cleanup on publish and discard, rejection of foreign keys, scheduled sweep (R2 suite); `LessonImageDialog.test.tsx`, `lessonDraft.test.ts`, `crop.test.ts`, image cases in `LessonEditor.test.tsx`; Playwright `course-images.spec.ts` (slash item, upload, publish refused until alt text, reader sees the image) passes in Chromium and WebKit.

## C7f — Columns

- [x] Enable `xl-multi-column`: `multiColumnDropCursor` (wrapped by `lessonDropCursor`), `withMultiColumn`, 2- and 3-column slash items (Lucide icons, labels from the catalog), width handles (built into the column node); dictionary merged under `multi_column`.
- [x] Clamp column count and nesting in the editor so the server never rejects what the editor allowed: `columnDrops.ts` refuses edge drops that would make a fourth column or nest columns (no drop cursor, drop swallowed in capture); `breaksColumnRules` + `normalizeEditorBlocks` repair anything else in place on change.
- [x] Tests: `lessonDraft.test.ts` column cases; Playwright `course-columns.spec.ts` (drag to edge, three-column slash item, reload round-trip, refused fourth column, reader side by side) passes in Chromium and WebKit, and the refusal case was confirmed to fail with refusal disabled; `mobile-layout.spec.ts` checks stacked columns in all three mobile projects.

## C7g — Merge and polish

- [x] Block-level three-way merge on `409` (`lessonMerge.ts`): base (last server draft the editor knew), local, and server documents compared by block ID on their own type, props, and content; different blocks merge automatically, positions follow the server except local additions and moves, and the same block (or delete against edit) is asked side by side in `LessonMergeConflicts`. The merged draft saves against the new version at once. Falls back to the C7d "keep my edit aside" banner when the merge breaks the contracts or a restored local edit has no known base.
- [x] Paste: `pasteHandler` sends a clipboard holding only an image file through the lesson image dialog; everything else uses BlockNote's parser, then `sanitizeEditorBlock` in `onChange` unwraps non-http(s) links, resets off-palette colours and alignment, and removes images that are not this lesson's uploads (one transaction per repair).
- [x] Tests: `lessonMerge.test.ts` (move vs edit both ways, delete vs edit both ways, both edit, same edit, additions, list and column orphans, editor defaults), `lessonDraft.test.ts` paste repair, `LessonEditor.test.tsx` (merged save, side-by-side choice, pasted HTML, pasted image file), Playwright `course-merge.spec.ts` with two editors (passes in Chromium and WebKit).

Progress notes (2026-10-07, C7g):

- Stored documents may omit editor defaults (`textAlignment: "left"`, `isToggleable: false`); the merge ignores them, otherwise every block of an API-seeded lesson looked edited on both sides. Found by the two-editor Playwright run.
- Unchosen merge alternatives are held in memory only; leaving the editor keeps whatever the editor shows. Documented in `docs/courses.md#drafts-and-publishing`.
- Verified: web type-check; web Vitest 24 files / 108 tests; production build (editor chunk ≈ 252 KB gzipped, lazy); all eight `course-*` Playwright specs pass in Chromium and WebKit. The full Playwright suite was not re-run.

## Release (after C7d, again after later phases)

- [ ] On the release branch: type-check, Vitest, RTL, Playwright, production builds for web and API.
- [ ] Back up or export production D1.
- [ ] Apply migration `0015` with an explicit `--remote`.
- [ ] Deploy the API, then the web app.
- [ ] Smoke test: an existing lesson reads correctly, an existing practice thread still opens, progress counts are unchanged.
- [ ] Final docs pass: `docs/data-model.md`, `docs/architecture.md`, `docs/design-system.md`, `docs/testing.md`, `docs/user-flows.md`, `docs/roadmap.md`.
