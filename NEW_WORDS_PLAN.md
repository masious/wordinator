# New words plan (C8)

Working plan for vocabulary blocks, per-step New words panels, and word recap. The rules live in [docs/courses.md](docs/courses.md#new-words-and-recap) and [docs/data-model.md](docs/data-model.md#course_lesson_words); this file holds the delivery steps only and links to the owners instead of restating rules. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed:

- Words live in a dedicated `vocabulary` lesson block, not in inline marks: dialogue and practice text are plain-text props, and the dictionary form (`der Hund`) differs from the form in the sentence (`den Hund`).
- Word fields: `id`, `term`, `meaning`, optional `forms`, `example`, and `note`, all plain text.
- A vocabulary block is never a step; its words join the step before it (prose, example, callout, every turn or item of a dialogue or practice), else the next one.
- The course recap covers only the published lessons the viewer has finished. A lesson recap is offered from the completion screen.
- The recap records nothing. A cross-course Words tab is deferred and would need its own product exception for review scheduling.
- C7 was released on 2026-10-07, so C8 can start. Migration numbering follows step-level lesson positions (`0016_course_lesson_positions.sql`), so C8 takes the next free number.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C8.0 — Docs and decisions

- [x] `docs/courses.md`: `vocabulary` block row, [new words and recap](docs/courses.md#new-words-and-recap) section, Words tab under Deferred.
- [x] `docs/data-model.md`: `course_lesson_words`.
- [x] `docs/roadmap.md`: C8 phase.

## C8a — Contracts

`packages/contracts/src/lessonDocument.ts`:

- [x] `vocabularyWordSchema` and `vocabularyPayloadSchema` (1–50 words; limits from the courses doc as named constants next to the existing course limits). Drafts accept empty `term` and `meaning`.
- [x] `vocabularySchema` leaf block: `props: { data }` as a JSON string refined with the payload schema, like `practiceSchema`; add it to `leafBlockSchema`. Keep `schemaVersion` 2.
- [x] `readVocabularyBlock` helper; word IDs join the document's unique-ID check.
- [x] `findPublishProblems`: `word-empty` with the block ID (and word ID) for an empty term or meaning.
- [x] `flattenToSteps`: every step type gains `words: VocabularyWord[]` (empty by default). Apply the attachment rules in leaf order, including the prose split, the dialogue/practice spread, the next-step fallback, combined consecutive blocks, and a words-only section becoming a `words` step. `lessonStepKey` must stay stable: a vocabulary block never becomes part of a key, except the words-only step, keyed by its first block ID.
- [x] `collectLessonWords(document)` → ordered words with block ID and position, used by the API index and the lesson recap.
- [x] `courseWordsResponseSchema` for the recap endpoint.
- [x] Contract tests: accepted and rejected payloads (limits, missing ID, duplicate IDs), the publish problem, every attachment rule and its step keys, `collectLessonWords` order, learner documents keeping words intact.

Notes (2026-10-07): limits are `COURSE_WORDS_PER_BLOCK_MAX` and `COURSE_WORD_*_MAX` in the package index, and `COURSE_RECAP_WORDS_MAX` (10,000) caps the recap response. The payload is `{ words }`. `word-empty` problems carry `wordId`. `collectLessonWords` trims text and turns empty optional fields into `null`, which is the shape C8b stores. Leading words join every turn or item of a following dialogue or practice. A columns step read as one carries its in-place words for the lesson recap, and C8d shows them in place instead of in a panel. Steps share a `StepBase` (`heading`, `words`). C8c must give pasted or duplicated vocabulary blocks fresh word IDs, because word IDs share the document's unique-ID check.

## C8b — Migration and API

- [x] Migration (next free number): `course_lesson_words` as in the data model, primary key `(lesson_id, word_id)`, index `(group_id, course_id, lesson_id, position)`, cascade from course and lesson. Update `packages/db/src/schema.ts` and Drizzle metadata (the Drizzle journal stops at `0004`; later migrations are hand-written, so only the schema changes).
- [x] Backfill in the migration: no published documents contain vocabulary yet, so the table starts empty; state this in the migration comment.
- [x] Publish: in the existing batch, delete the lesson's rows and insert `collectLessonWords(published)` (bind as one JSON array through `json_each`, like practice anchors). Unpublish and lesson delete remove the rows.
- [x] `GET /groups/:groupId/courses/:courseId/words`: membership and course visibility as for the course read; rows only from lessons with `published_doc IS NOT NULL` that the viewer has a completion for; ordered by lesson position, then word position; de-duplicate repeated terms (trimmed, case-insensitive) keeping the first. Cursor pagination is unnecessary at the 200 × 50 bound, but cap the response defensively.
- [x] Workers tests: tenant isolation (another group's course ID, nested IDs), non-member and former-member denial, archived-course visibility, only finished and currently published lessons, unpublish/republish/edit-then-publish keep the index in step, lesson delete cascades, duplicate terms.

Notes (2026-10-07): migration `0017_course_lesson_words.sql`. The publish batch's word statements repeat the draft-version guard, so a stale publish leaves the index alone. Discard needs no index change because the published document stays the same. Deduplication compares `trim().toLowerCase()` in the Worker (SQLite's `lower()` is ASCII-only). The response is sliced to `COURSE_RECAP_WORDS_MAX`.

## C8c — Editor

Deferred (2026-10-07): the first courses are written directly in the database. Meanwhile `editorSchema.tsx` has a read-only `vocabulary` spec so editing a lesson keeps its words; the items below replace it.

`apps/web/src/organisms/LessonEditor`:

- [x] `vocabulary` custom spec in `editorSchema.tsx` with a `VocabularyFields` form (rows of term, meaning, and expandable forms, example, and note; add, remove, and reorder rows), following `PracticeFields`.
- [x] Slash item "New words" with an icon and i18next labels; new word IDs from `crypto.randomUUID()`.
- [x] Publish bar lists `word-empty` problems and focuses the row.
- [x] Merge (`lessonMerge.ts`) needs no change because the block is compared by props; add a test that two editors' edits to the same vocabulary block are asked side by side.
- [x] Tests: RTL for adding, editing, and removing words, autosave round-trip, publish problem focus; `lessonDraft` sanitizing leaves vocabulary intact.

Notes (2026-10-07): the form writes the block's props on every change (drafts accept empty words, so there is no separate local form state), which also keeps merge choices in step. `vocabularyIdRepairs` in `lessonDraft.ts` runs in the editor's `onChange` and gives a pasted or duplicated block fresh IDs for repeated words. A word problem focuses the word's first empty field through `data-word-id` and `data-word-field`. `IconButton` now accepts native button props so the reorder buttons can take `onClick`. A Playwright case in `course-words.spec.ts` authors words through the slash item.

## C8d — Reader, player, and recap

- [x] `LessonDocument` renderer: vocabulary block as a compact word list (term with forms, meaning, example, and note), escaped text only.
- [x] `LessonPlayer`: New words panel on any step with `words`; a `words` step for words-only sections. Coordinate with step-level positions so resuming keys stay stable.
- [x] `WordRecap` organism in the player shell: one card per word, Show meaning reveals meaning, example, and note; Back and Next; no recording.
- [x] Completion screen: Review words when the run's steps carried words.
- [x] Course page: Review words when the course words endpoint returns any; TanStack Query owns the fetch, and the route loader stays small.
- [x] Tokens for the panel and card in `apps/web/src/tokens.css`, documented in `docs/design-system.md`; all copy through i18next.
- [x] Tests: RTL for the renderer, the panel on each step kind, recap stepping and reveal, entry points shown only when words exist; Playwright: author a lesson with words after an example and after a dialogue, publish, finish it as another member, see the panels, then review words from the course page (Chromium and WebKit, plus `mobile-layout.spec.ts` coverage of the recap).

Notes (2026-10-07): `NewWords` in `LessonDocument.tsx` serves the reader block, the player panel, and the words step; a columns step shows its words in place, without a panel. `WordRecap` and `runWords` live in `organisms/WordRecap`. The lesson recap covers the completion screen, which stays mounted so the completion is recorded once. Tokens: `--color-words-surface`, `--color-words-card`. Playwright seeds the lesson through the API (the editor has no New words item) and finishes it as the e2e creator, the only seeded account; per-member results are covered by the Workers tests. The stale "Show translation" steps in `CourseLessons.test.tsx` and `course-progress.spec.ts` were updated to the documented behaviour (the translation shows with the sentence).

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API (all passed locally on 2026-10-07 for C8a, C8b, and C8d; rerun on the release commit).
- [ ] Back up production D1, apply the C8 migration with an explicit `--remote`, deploy the API, then the web app.
- [~] Seed words into the existing courses (production has two) to review the panel manually: read each published lesson, find the words it introduces, and add `vocabulary` blocks directly after the block that introduces them, so the words join that block's step under the [attachment rules](docs/courses.md#words-in-the-player). Word IDs are fresh UUIDs, unique within the lesson. Write the same document to `draft_doc` and `published_doc` (keeping both equal, so the lesson shows no unpublished changes), and fill `course_lesson_words` from it in the same statement batch, because direct SQL skips the publish route that maintains the index. Back up D1 first and target it with an explicit `--remote`. Then check each lesson's panels in the player, the reader's word lists, and both recaps.

  Notes (2026-10-07): seeded 74 words (Leggen of zetten? 49, Mijn huis 15, Een huis beschrijven 10), one vocabulary block after each block that first introduces words, each term once per lesson; the existing "New words" callouts and practice notes were left as written. Every statement was guarded by the read draft version and `draft_doc = published_doc`, step keys were checked unchanged, and a dry run ran on the backup first (`~/wordinator-backups/wordinator-2026-10-07T201222Z-c8-word-seed/`). Remaining: the manual check in the player, reader, and both recaps.
- [ ] Smoke test: an existing lesson reads and plays unchanged; a newly published lesson with words shows panels and appears in the course recap after finishing it.
- [ ] Docs pass: `docs/courses.md` status line, `docs/architecture.md` (route), `docs/testing.md`, `docs/user-flows.md`, `docs/design-system.md`, `docs/roadmap.md`. Delete this file once C8 ships.
