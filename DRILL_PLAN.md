# Drill plan (C12)

Working plan for the Words tab lesson filter, the spoken reveal on word cards, and Drill. The rules live in [docs/words.md](docs/words.md) (filter in [Words tab](docs/words.md#words-tab), spoken reveal in [word cards](docs/words.md#word-cards), everything else in [Drill](docs/words.md#drill)) and [docs/data-model.md](docs/data-model.md#course_word_drill_states); this file holds the delivery steps only and links to the owners instead of restating rules. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed (2026-10-12):

- This reverses C9's "nothing graded, no shuffle, no scheduling" for a separate Drill mode only; word cards stay ungraded. Drilling is named Drill, because Practice already means practice blocks and Review words means the recap.
- Weakness stays private and qualitative: no scores, percentages, streaks, due counts, or weak markers on cards, consistent with the no-gamification non-goal in [what it is](docs/what_is_it.md).
- Lesson filter: server-side `lessonId` on the bookmark list plus a lessons-with-bookmarks facet read; the filter lives in the URL. No course filter.
- Spoken reveal on every word card surface; Show all and Hide meaning stay silent; a device-remembered sound toggle.
- Drill: self-graded (no typing), one card at a time on its own page, 20 cards, Again requeues 3–5 cards later, only the first grade counts, end-of-session summary.
- Produce fronts show the meaning, the lesson as context, and the example with the term blanked.
- Mixed uses each word's weaker direction and holds a term key once per session.
- Lesson drill uses all the lesson's published words; Weak words uses bookmarks only. Started from the Words tab only for now.
- Memory: per-direction Leitner boxes 1–5, latest state only, no due dates; kept when the bookmark is removed.
- The new table has no `group_id`, per the [storage compatibility](docs/groups-and-membership.md#storage-compatibility) rule.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C12.0 — Docs and decisions

- [x] `docs/words.md` (filter, spoken reveal, Drill, API; stale group wording removed), `docs/data-model.md` `course_word_drill_states`, `docs/speech.md` reveal exception, `docs/courses.md` status and Deferred, `docs/roadmap.md` C9 status and C12, `docs/index.md`, and the C9c checklist in `WORDS_PLAN.md`.

## C12a — Lesson filter (API and web)

- [x] Contracts: optional `lessonId` on the bookmark list query; `wordBookmarkLessonsResponseSchema`.
- [x] API: `lessonId` filter on `GET .../word-bookmarks` (cursor unchanged); `GET .../word-bookmarks/lessons` with visible counts, ordered by course then lesson position, reusing `courseVisibleClause`.
- [x] Web: lessons facet query under `wordBookmarksKey`, invalidated with the other bookmark views; a grouped select on `WordsPage` bound to the `lesson` search param (validated in the route, falling back to All lessons); the infinite query keyed by the filter; unbookmarked cards stay until the filter changes.
- [x] Tests: Workers for the filter, counts, ordering, hidden words not counted, another account's bookmarks, invisible lessons returning an empty page; RTL for the select, URL round trip, and fallback.
- [x] Docs: `docs/words.md` (order, kept lesson, `INVALID_FILTER`), `docs/architecture.md`, `docs/design-system.md` (`--size-words-filter`), `docs/testing.md`, `docs/user-flows.md`.

Notes (2026-10-12): courses in the filter come oldest first, so Part I precedes Part II. A malformed `lessonId` is `400 INVALID_FILTER`; the route drops a malformed `lesson` param before it reaches the API. A lesson chosen this visit stays in the select with a count of 0 after its last bookmark is removed, instead of falling back, so the cards stay in place. The pre-existing `words-tab.spec.ts` failure (the bookmark toggle moved behind the New words row's Show more chevron) is fixed, and the spec now also filters by lesson. The full Workers suite fails to start its runtimes in parallel on this machine (`No such module …devalue`, also on a clean tree); every file passes when run on its own.

## C12b — Spoken reveal (web only)

- [ ] `WordRecap`: Show meaning on one card plays the term clip through the shared `Speech` element when ready and the sound is on; Show all and Hide meaning play nothing; playing stops when the page changes.
- [ ] Sound toggle beside the counter, stored per device in `localStorage` (`wordinator:reveal-sound:v1`), wrapped in try/catch with on as the fallback.
- [ ] Tests: RTL for playing on reveal, silence for Show all, Hide meaning, a missing clip, and sound off, and the stored preference; a check that recap surfaces inherit it.
- [ ] Docs: `docs/design-system.md` toggle placement, `docs/testing.md`.

## C12c — Drill contracts and data

- [ ] Contracts: `WORD_DRILL_SESSION_SIZE`, the direction and result enums, `wordDrillQuerySchema`, `wordDrillDeckSchema`, `wordDrillGradeRequestSchema`, and the response.
- [ ] Migration `0025_course_word_drill_states.sql` with `packages/db/src/schema.ts`, as in the data model.
- [ ] Pure deck builder in `packages/db` (or the API), separate from SQL so it can be unit tested: tiers, the weaker direction for Mixed, one term key per session keeping the weakest, the session cap, random tie-breaks and shuffle through an injected random source.
- [ ] Vitest for the deck builder and the box transitions (new → 2 on Got it, any → 1 on Again, capped at 5).

## C12d — Drill API

- [ ] `GET .../word-drill`: load eligible words (visible bookmarks, or the lesson's published index under lesson read visibility) with their drill states in both directions, build the deck, attach `speech`, course, and lesson.
- [ ] `PUT .../lessons/:lessonId/words/:wordId/drill/:direction`: check the word in the published index and course visibility, upsert the box in one statement, return `{ box }`.
- [ ] Lesson deletion removes drill states explicitly in its batch.
- [ ] Workers tests: anonymous and incomplete-onboarding refusal, another account's states never read or written, invisible and draft courses `404`, unpublished and missing words refused, `400 INVALID_DRILL`, deck tiers and term-key uniqueness over real rows, state kept after unbookmarking, lesson and course deletion, the Leitner transitions through the route.

## C12e — Drill web

- [ ] Setup dialog from a Drill button on `WordsPage`: Weak words / Lesson (lesson select from the facet, defaulting to the filter), Mixed / Understand / Produce labelled with the library language; Weak words disabled with no bookmarks.
- [ ] Route `/words/drill` (`routes/words_.drill.tsx`) validating its search params; the deck query is fetched once per session and not refetched in the background.
- [ ] Drill card: Understand and Produce fronts (blanked example via `wordSearchKey` matching), flip in place with reduced motion respected, reveal audio under the shared sound toggle, Again / Got it, Space, `1`, `2`.
- [ ] Session queue: requeue after Again, first grade sent once per card with a quiet retry message on failure, counter, a word gone mid-session finishing locally.
- [ ] Summary with Drill again and Back to words; empty deck state.
- [ ] All copy through i18next; tokens from `docs/design-system.md`; desktop only.
- [ ] Tests: RTL for setup, both fronts, reveal audio, grading and requeue, single first grade, keyboard, summary, failure message; Playwright `words-drill.spec.ts` for bookmarking words, a mixed session that never shows a term twice, and Weak words starting with a word graded Again.
- [ ] Docs: `docs/architecture.md` routes and API, `docs/user-flows.md`, `docs/testing.md`, `docs/design-system.md`, `docs/words.md` and `docs/roadmap.md` status.

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API on the release commit.
- [ ] Back up production D1, apply `0025` with an explicit `--remote` (after `0018` from C9), deploy the API, then the web app.
- [ ] Smoke test: filter the Words tab by a lesson, reveal a card and hear it, drill a lesson in Mixed, grade a word Again, and see it lead the next Weak words session.
- [ ] Delete this file once C12 ships.
