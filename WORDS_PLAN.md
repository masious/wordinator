# Words plan (C9)

Working plan for word cards, word bookmarks, and the Words tab. The rules live in [docs/words.md](docs/words.md) and [docs/data-model.md](docs/data-model.md#course_word_bookmarks); this file holds the delivery steps only and links to the owners instead of restating rules. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed (2026-10-08):

- The recap shows as many fixed-height cards as fit without scrolling; each card flips in place to reveal, and a page-level Reveal all reveals the page. No shuffle.
- Bookmarks are offered on word cards and on New words lists (player panel, words step, reader), including for unfinished lessons, and only for published words.
- A bookmark references `(lesson, word ID)` and reads its text from `course_lesson_words`, so removed words are hidden and author edits show.
- The Words tab sits in the desktop navigation and, below `48em`, in the More sheet. It shows bookmarks newest first; the same term from two lessons shows twice.
- The no-gamification non-goal was removed on 2026-10-08, but the tab still adds no scheduling, scores, or streaks.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C9.0 — Docs and decisions

- [x] `docs/words.md` created and indexed; `docs/what_is_it.md` non-goal removed; `docs/courses.md` Words tab moved out of Deferred; `docs/data-model.md` `course_word_bookmarks`; `docs/roadmap.md` C9 phase.

## C9a — Word cards (web only)

`apps/web/src/organisms/WordRecap`:

- [x] Card grid with a fixed card height and minimum card width as tokens in `apps/web/src/tokens.css`; columns from the grid width (one below `40em`, at most three); rows from the height available without page scroll (a `ResizeObserver` on the grid's container, at least one row). Recompute on resize, keeping the page with the first visible word.
- [x] Range counter, Back and Next by page, the done action on the last page, and an optional done action (the Words tab has none).
- [x] Flip in place per card: front term and forms, back smaller term, meaning, example, and note scrolling inside the card; Reveal and Hide on one focused toggle; reduced motion removes the rotation.
- [x] Reveal all / Hide all for the page; changing page resets to fronts.
- [x] Measure the space the lesson player shell and the course recap leave for the grid, including the mobile shell; all copy through i18next.
- [x] Tests: RTL for page size from mocked sizes, paging and range, resize keeping the first word, per-card flip, Reveal all, the done action; Playwright `course-words.spec.ts` updated for pages; `mobile-layout.spec.ts` checks the grid never scrolls the page at Pixel 7, 360px, and iPhone 13.
- [x] Docs: `docs/courses.md` word recap, `docs/design-system.md` card tokens and flip, `docs/user-flows.md`, `docs/testing.md`.

Notes (2026-10-08): `measureFit` in `organisms/WordRecap/fitGrid.ts` reads columns from the grid's CSS tracks and fits rows to the dialog's content box (Mantine's `.mantine-Modal-content` inside `.mantine-Modal-inner`), or to the viewport outside a dialog, which C9c's page will use and must verify. Everything around the grid is measured separately from the grid's own height, so applying a fit never changes the next measurement. It remeasures on resize and after the dialog's entry transition. The copy says Show meaning and Show all rather than Reveal. `WordRecap` takes `doneLabel` and `onDone` as optional so the Words tab can omit them. At 1280×720 the desktop dialog fits one row of two cards. Pre-existing failures outside C9a, left alone: the New words panel now hides examples and notes until a row is clicked (commit `7d3bc1d`), which `docs/courses.md` contradicts ("nothing is concealed") and which fails `LessonDocument.test.tsx` and the panel checks in `course-words.spec.ts`; the same spec also still expects dialogue words on every line.

## C9b — Bookmarks

- [ ] Contracts: bookmark keys and list responses, `WORD_BOOKMARKS_MAX`, `lessonId` on course words.
- [ ] Migration `0018_course_word_bookmarks.sql` as in the data model, with `packages/db/src/schema.ts`. No foreign key to `course_lesson_words`: publishing replaces those rows, which would cascade bookmarks away.
- [ ] API routes from [docs/words.md](docs/words.md#api); lesson deletion removes bookmarks explicitly in its batch. Bookmark reads join `course_lesson_words` and apply course visibility.
- [ ] Web: one bookmark keys query per group with optimistic toggles and revert on failure; the toggle on word cards and in `NewWords` (player panel, words step, reader list); hidden in previews and drafts.
- [ ] Workers tests: tenant isolation (another group's course, lesson, and word IDs), non-member and former-member denial, unpublished and missing words refused, idempotent put and delete, the limit, hidden after edit-out or unpublish and back after republish, course visibility, lesson and course deletion.
- [ ] RTL: toggles on each surface, optimistic revert, no toggle in a preview. Playwright: bookmark from the panel and from the recap.
- [ ] Docs: `docs/architecture.md` routes, `docs/user-flows.md`, `docs/testing.md`, `docs/security-and-privacy.md` if bookmark privacy needs a line.

## C9c — Words tab

- [ ] Route `/groups/$groupId/words` with a small loader; TanStack infinite query over the bookmark list, fetching the next page when Next reaches the loaded end.
- [ ] Navigation: desktop island destination with an icon; More sheet entry below `48em`, marking More current on the route.
- [ ] Page: word cards with course and lesson on each card, newest first; unbookmarked cards stay in place until the page is left; empty state.
- [ ] Tests: RTL for the page, empty state, unbookmark staying in place, loading the next page; Playwright for bookmarking in a lesson then reviewing it on the tab, desktop and mobile navigation, and `mobile-layout.spec.ts` for the route.
- [ ] Docs: `docs/design-system.md` navigation and More sheet, `docs/architecture.md` web route, `docs/user-flows.md`, `docs/testing.md`, `docs/words.md` and `docs/roadmap.md` status.

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API on the release commit.
- [ ] Back up production D1, apply `0018` with an explicit `--remote`, deploy the API, then the web app.
- [ ] Smoke test: bookmark a word in a lesson, see it on the Words tab, unpublish the lesson and see it hidden, republish and see it back.
- [ ] Delete this file once C9 ships.
