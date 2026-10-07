# New words plan (C8)

Working plan for vocabulary blocks, per-step New words panels, and word recap. The rules live in [docs/courses.md](docs/courses.md#new-words-and-recap) and [docs/data-model.md](docs/data-model.md#course_lesson_words); this file holds the delivery steps only and links to the owners instead of restating rules. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed:

- Words live in a dedicated `vocabulary` lesson block, not in inline marks: dialogue and practice text are plain-text props, and the dictionary form (`der Hund`) differs from the form in the sentence (`den Hund`).
- Word fields: `id`, `term`, `meaning`, optional `forms`, `example`, and `note`, all plain text.
- A vocabulary block is never a step; its words join the step before it (prose, example, callout, every turn or item of a dialogue or practice), else the next one.
- The course recap covers only the published lessons the viewer has finished. A lesson recap is offered from the completion screen.
- The recap records nothing. A cross-course Words tab is deferred and would need its own product exception for review scheduling.
- C8 starts after the C7 release. Migration numbering follows step-level lesson positions (`0016_course_lesson_positions.sql`), so C8 takes the next free number.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C8.0 — Docs and decisions

- [x] `docs/courses.md`: `vocabulary` block row, [new words and recap](docs/courses.md#new-words-and-recap) section, Words tab under Deferred.
- [x] `docs/data-model.md`: `course_lesson_words`.
- [x] `docs/roadmap.md`: C8 phase.

## C8a — Contracts

`packages/contracts/src/lessonDocument.ts`:

- [ ] `vocabularyWordSchema` and `vocabularyPayloadSchema` (1–50 words; limits from the courses doc as named constants next to the existing course limits). Drafts accept empty `term` and `meaning`.
- [ ] `vocabularySchema` leaf block: `props: { data }` as a JSON string refined with the payload schema, like `practiceSchema`; add it to `leafBlockSchema`. Keep `schemaVersion` 2.
- [ ] `readVocabularyBlock` helper; word IDs join the document's unique-ID check.
- [ ] `findPublishProblems`: `word-empty` with the block ID (and word ID) for an empty term or meaning.
- [ ] `flattenToSteps`: every step type gains `words: VocabularyWord[]` (empty by default). Apply the attachment rules in leaf order, including the prose split, the dialogue/practice spread, the next-step fallback, combined consecutive blocks, and a words-only section becoming a `words` step. `lessonStepKey` must stay stable: a vocabulary block never becomes part of a key, except the words-only step, keyed by its first block ID.
- [ ] `collectLessonWords(document)` → ordered words with block ID and position, used by the API index and the lesson recap.
- [ ] `courseWordsResponseSchema` for the recap endpoint.
- [ ] Contract tests: accepted and rejected payloads (limits, missing ID, duplicate IDs), the publish problem, every attachment rule and its step keys, `collectLessonWords` order, learner documents keeping words intact.

## C8b — Migration and API

- [ ] Migration (next free number): `course_lesson_words` as in the data model, primary key `(lesson_id, word_id)`, index `(group_id, course_id, lesson_id, position)`, cascade from course and lesson. Update `packages/db/src/schema.ts` and Drizzle metadata.
- [ ] Backfill in the migration: no published documents contain vocabulary yet, so the table starts empty; state this in the migration comment.
- [ ] Publish: in the existing batch, delete the lesson's rows and insert `collectLessonWords(published)` (bind as one JSON array through `json_each`, like practice anchors). Unpublish and lesson delete remove the rows.
- [ ] `GET /groups/:groupId/courses/:courseId/words`: membership and course visibility as for the course read; rows only from lessons with `published_doc IS NOT NULL` that the viewer has a completion for; ordered by lesson position, then word position; de-duplicate repeated terms (trimmed, case-insensitive) keeping the first. Cursor pagination is unnecessary at the 200 × 50 bound, but cap the response defensively.
- [ ] Workers tests: tenant isolation (another group's course ID, nested IDs), non-member and former-member denial, archived-course visibility, only finished and currently published lessons, unpublish/republish/edit-then-publish keep the index in step, lesson delete cascades, duplicate terms.

## C8c — Editor

`apps/web/src/organisms/LessonEditor`:

- [ ] `vocabulary` custom spec in `editorSchema.tsx` with a `VocabularyFields` form (rows of term, meaning, and expandable forms, example, and note; add, remove, and reorder rows), following `PracticeFields`.
- [ ] Slash item "New words" with an icon and i18next labels; new word IDs from `crypto.randomUUID()`.
- [ ] Publish bar lists `word-empty` problems and focuses the row.
- [ ] Merge (`lessonMerge.ts`) needs no change because the block is compared by props; add a test that two editors' edits to the same vocabulary block are asked side by side.
- [ ] Tests: RTL for adding, editing, and removing words, autosave round-trip, publish problem focus; `lessonDraft` sanitizing leaves vocabulary intact.

## C8d — Reader, player, and recap

- [ ] `LessonDocument` renderer: vocabulary block as a compact word list (term with forms, meaning, example, and note), escaped text only.
- [ ] `LessonPlayer`: New words panel on any step with `words`; a `words` step for words-only sections. Coordinate with step-level positions so resuming keys stay stable.
- [ ] `WordRecap` organism in the player shell: one card per word, Show meaning reveals meaning, example, and note; Back and Next; no recording.
- [ ] Completion screen: Review words when the run's steps carried words.
- [ ] Course page: Review words when the course words endpoint returns any; TanStack Query owns the fetch, and the route loader stays small.
- [ ] Tokens for the panel and card in `apps/web/src/tokens.css`, documented in `docs/design-system.md`; all copy through i18next.
- [ ] Tests: RTL for the renderer, the panel on each step kind, recap stepping and reveal, entry points shown only when words exist; Playwright: author a lesson with words after an example and after a dialogue, publish, finish it as another member, see the panels, then review words from the course page (Chromium and WebKit, plus `mobile-layout.spec.ts` coverage of the recap).

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API.
- [ ] Back up production D1, apply the C8 migration with an explicit `--remote`, deploy the API, then the web app.
- [ ] Smoke test: an existing lesson reads and plays unchanged; a newly published lesson with words shows panels and appears in the course recap after finishing it.
- [ ] Docs pass: `docs/courses.md` status line, `docs/architecture.md` (route), `docs/testing.md`, `docs/user-flows.md`, `docs/design-system.md`, `docs/roadmap.md`. Delete this file once C8 ships.
