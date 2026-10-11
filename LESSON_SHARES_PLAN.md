# Lesson shares plan (C11)

Working plan for sharing lesson blocks to the journal, and for a local Storybook of every post variant. The rules will live in a new [docs/lesson-shares.md](docs/lesson-shares.md) (created in C11.0) and in the owners it links to; this file holds the decisions and delivery steps only. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Decisions

Agreed with the product owner (2026-10-11):

- Three shareable things: an **example** block, a **dialogue** block, and **one question** of a practice (its instruction travels with it). Reading passages and the questions of a practice with a passage cannot be shared.
- A share is a journal post. The byline reads like "Masoud shared a question from lesson 3 of Dutch Foundations 5 hours ago." It has reactions and ordinary visible comments, no pinning, and no answer threads.
- A shared question offers the private **answer check**: the viewer types an answer and is told whether it matches the author's version, using the contracts' `answerMatches` / `blankMatches`, exactly as in the lesson. A miss shows the author's version as a reference. Nothing is sent or stored.
- **Examples and questions are snapshots** of the published block at share time. **Dialogues are references** to `(lesson, block)` and render the current published turns, so they keep their speech clips and follow author edits.
- **No duplicates.** A person can share a given block (for a question, a given question) once. Afterwards the share action reads Already shared and links to the post. Deleting the post frees it again.
- **Sharer's note.** The confirmation dialog has an optional plain-text note. When the block already has a learner-visible note, the field is prefilled with it and stays editable. It is the post's ordinary notes field, so it follows the existing notes rules (hidden until revealed on the post page; settled in C11.0).
- **Entry points.** Clicking a block on the lesson page reveals its share button (no hover-only affordance, so touch works the same). The lesson player offers share on example, dialogue, and question steps. On the lesson page, questions are shared from the Answer dialog (and so also from Practise again), one share button per question.
- No notification when someone shares.
- **Storybook** covers every post variant (the five existing types and the three share kinds, in feed card and detail form, plus their unavailable states). It is a local developer tool only: not part of type-checking gates, tests, CI, or deployment. Stories for future features are optional.

Settled while planning (2026-10-11). Flag any you disagree with before C11a starts:

1. **Prefilled note = example note only.** Example notes are shown to learners, so they prefill. A practice item's note is editor-only ([practice answers](docs/courses.md#practice-answers)) and stripped from learner reads, so it never prefills. Prefilling it, even for editors, would publish an editor-only note to the journal.
2. **Example sentences keep their formatting in the journal.** The snapshot keeps the sentence's inline content (bold, italic, palette colours, safe links) and is rendered read-only by the lesson renderer's `InlineText`. This is a narrow, explicit exception to "user content is plain text"; CLAUDE.md and the product requirements are updated to say so. Posts, comments, and the sharer's note stay plain text, and the BlockNote editor is not used anywhere in the journal.
3. **Example speech is kept too.** Clips are content-addressed and never deleted ([speech retention](docs/speech.md)), so the example snapshot stores its clip's hash and the post plays the same audio as the lesson.
4. **The answer check lives on the post page**, not the feed card: the card's byline and preview are one link, which cannot contain inputs. The card shows the instruction and the prompt with blanks as `…`. The answer is kept as a local draft (kind `share-answer`, the post as target) so it survives navigation, and nothing reaches the server.
5. **Duplicate key.** Example and dialogue: the block ID. Question: the block ID plus the normalised prompt text. Practice items have no stable IDs (they are addressed by index), so keying on the index would mark the wrong question after the author reorders items.
6. **Availability.** Snapshots stay readable after the lesson changes, is unpublished, or is deleted, or after the course is archived; only the link to the lesson is dropped when the viewer can no longer open it. A dialogue reference shows "This dialogue is no longer available" when its block is gone from the published document, the lesson is unpublished or deleted, or the course is archived (the same rule as the [course card](docs/posts-and-feed.md#course)). The byline uses the live lesson number and course title while the lesson is visible, and otherwise falls back to the titles snapshotted at share time.
7. **Who can share.** Any set-up account, but only from the **published** document of a lesson the viewer can read, in a course that is not archived. Draft previews offer no share action. Answer concealment is not authorization, so the API re-reads the published document and builds the snapshot itself; it never trusts block content sent by the client.

Answers to the questions raised:

- **Answer matching on existing posts.** Question posts have no author's answer and no matching. Fill-in posts do match, but on the server and with a different rule: trimmed, case-insensitive, positive-only, without `normalizeAnswer`'s punctuation, quote, and spacing folding. Shared questions use the lesson's `answerMatches`, so nothing new is needed for them. Bringing fill-in posts onto `answerMatches` is a separate product question and is not part of C11.
- **Existing `/ui` workbench.** `apps/web/src/routes/ui.tsx` (`UiWorkbench`) overlaps with Storybook. C11.0 records whether the workbench stays; this plan leaves it untouched.

## C11.0 — Docs and decisions

- [x] Create `docs/lesson-shares.md` (share kinds, snapshot vs reference, entry points, confirmation and note, duplicates, availability, answer check, API) and add it to `docs/index.md`.
- [x] `docs/posts-and-feed.md`: the `lesson_share` post type with its three kinds, the bylines, card previews, and the editing rule (the note is editable; the shared content is not).
- [x] `docs/courses.md`: the share entry points on the lesson page, in the Answer and Practise again dialogs, and in the player; feed presence beyond the course post.
- [x] `docs/data-model.md`: `posts.type` gains `lesson_share`; new `post_lesson_shares` table (below).
- [x] `docs/discussions-and-reactions.md`: share posts take ordinary comments; the answer check publishes nothing.
- [x] `docs/security-and-privacy.md`: snapshots outlive unpublishing; item notes are never shared; the server builds snapshots.
- [x] CLAUDE.md and `docs/product-requirements.md`: the example-sentence rich-text exception (decision 2).
- [x] `docs/testing.md`: Storybook is a local preview tool outside the release gates.
- [x] `docs/roadmap.md`: C11 phase, approved 2026-10-11.

Notes (2026-10-11): the sharer's note is the post's ordinary notes field, concealed like every post's notes, so a hint on a shared question is not a spoiler; the limit is the post notes limit rather than a separate 2,000. `docs/user-flows.md` gained a Share a piece of a lesson flow. Two lines of `docs/courses.md` still said learners never receive authors' versions, which has been wrong since the on-device check (2026-10-10); they now match [practice answers](docs/courses.md#practice-answers). `/ui` stays the release-gated visual inventory; Storybook sits beside it as a local tool. `docs/architecture.md` routes and `docs/design-system.md` tokens are updated when C11b and C11c implement them.

## C11a — Contracts and data

- [x] Contracts: a `lessonShareKind` (`example` | `dialogue` | `question`); `createLessonShareRequest` (`courseId`, `lessonId`, `blockId`, `itemIndex` for a question, optional `note` under the post notes limit); snapshot schemas (example: inline content, translation, note, clip hash; question: instruction, prompt, author's version list, item index); a discriminated `lessonSharePost` in the post response union with the live/fallback byline fields, a dialogue's resolved turns and clip URLs, and `available`. Errors: `409 LESSON_SHARE_EXISTS` (with `postId`), `422 LESSON_SHARE_NOT_SHAREABLE` (passage practice, unknown block or item, wrong block type), plus the existing course and lesson visibility errors.
- [x] Lesson reads gain `myShares`: the viewer's share keys mapped to post IDs, so the share action shows Already shared without another request.
- [x] Migration `0024_lesson_shares.sql`: rebuild `posts` to allow `lesson_share` in the type check, using the `0012` approach (constraint-free copies of reading questions, expected answers, comments, response items, and pins, then restore). Add `post_lesson_shares`: `post_id` PK → posts cascade, `kind`, `course_id` → courses, nullable `lesson_id` → lessons `ON DELETE SET NULL`, `block_id`, nullable `item_index`, `share_key`, `author_id`, snapshot JSON (null for dialogue), `course_title` and `lesson_title` snapshots, with a unique index on `(author_id, share_key)` and an index on `lesson_id`. Update `packages/db/src/schema.ts`.
- [x] Contracts and db unit tests: request validation, snapshot schemas, the share-key helper (prompt normalisation reuses `normalizeAnswer`).

Notes (2026-10-11): `inlineContentSchema`, `inlineText`, `lessonColorSchema`, and `isSafeLessonHref` moved from `lesson-document` into the main contracts (still re-exported there), because the example snapshot sits in the post schema and the main contracts cannot import `lesson-document`. The post schema gains a nullable `lessonShare` field (lazy, discriminated by `kind`) rather than turning `postSchema` into a union, matching how `course` posts carry `course`; the API returns `lessonShare: null` until C11b. Snapshot kinds have no `available` flag (they are always readable); every kind has a `source` whose `linked` says whether the viewer can open the lesson. The note-only edit body is `updateLessonShareRequestSchema` (`{ type: "lesson_share", notes }`), wired in C11b. `post_lesson_shares` also stores the group ID and creation time (per [data model](docs/data-model.md#post_lesson_shares)) and has check constraints for kind, item index, and snapshot. `myShares` is served by the lesson read and the course page's preloaded lessons now; rows are inserted only by tests until the C11b endpoint. Tests: `packages/contracts/src/lessonShares.test.ts`, `apps/api/test/lesson-shares-migration.test.ts`, `apps/api/test/lesson-shares.test.ts`. The db package has no tests of its own; the migration test covers it.

## C11b — API

- [x] `POST .../lesson-shares`: authenticate, require username setup, load the lesson's **published** document through the contracts' parser, check course visibility and not archived, find the block (columns included), refuse passage practices and out-of-range items, build the snapshot server-side (author's version kept, item note dropped, example clip hash from the speech key `example:{blockId}`), insert the post and the share row in one D1 batch, and map the unique-index violation to `409` with the existing post's ID. The note is plain text and never logged.
- [x] Feed, profile list, post detail, and new-post polling resolve share posts: dialogue references read the block from the published document in SQL (`json_tree`, as practice counts do) or in a batched read, attach turn clip URLs from `speech_clips`, and mark them unavailable under decision 6. Keep the feed to a bounded number of queries per page.
- [x] `PATCH` on a share post edits only the note; deletion follows the normal post rules and frees the share key.
- [x] Workers tests: unauthenticated and not-set-up refused; draft-only, unpublished, archived, other-course, missing-block, wrong-type, passage, and out-of-range refused; client-sent content ignored; item note never present in the snapshot or response; duplicate gives `409` with the post ID; re-share after deletion; dialogue becomes unavailable after block removal, unpublish, lesson deletion, and archive, and back after republish; snapshot survives all of those; lesson deletion keeps snapshot posts; editing refuses content changes.

Notes (2026-10-11): the route is `POST /api/groups/:groupId/lesson-shares` (the group scope every API route still has), answering `201` with the post. Beyond the planned errors, an archived course the sharer can still see gives `409 COURSE_ARCHIVED` and an unpublished lesson its editors can see gives `409 LESSON_UNPUBLISHED`; an `itemIndex` on an example or dialogue, or none on a practice, is `422`. A repeat is caught by a pre-check and, for a race, by the unique index. Share posts are resolved by one query per page (live course, lesson, a lesson number counted among published lessons, and a dialogue's turns via `json_tree`) plus one `speech_clips` lookup for dialogue turns. A dialogue is available under the course card's visibility rule, so a restored (draft) course shows it only to its owner and active contributors until it is published again. Deleting a share post removes its share row explicitly as well as by cascade. Share discussions are not concealed and refuse pins. Tests: `apps/api/test/lesson-shares.test.ts`.

## C11c — Web: sharing

- [x] A share molecule: the button (Share, or Already shared linking to the post) and the confirmation dialog, which previews the share in the same component the feed card uses, with the note field (prefilled per decision 1) and Share / Cancel. Use an optimistic `myShares` update and invalidate the feed.
- [x] Lesson page: clicking an example or dialogue block selects it and reveals its share button; Escape or clicking elsewhere clears the selection. Clicks on interactive children (speech controls, links) do not select. It is keyboard-reachable: the block is focusable and Enter reveals the button. Hidden in draft previews and archived courses.
- [x] Answer dialog and Practise again: a share button beside each question, disabled with an explanation for passage practices.
- [x] Player: a share action on example, dialogue, and question steps, using the same dialog.
- [x] i18next keys for every label, the three bylines, Already shared, and the unavailable states. Tokens in `docs/design-system.md` for the selected-block outline and share cards.
- [x] RTL: selection and reveal by click and keyboard; no share in previews or archived courses; prefill rules; Already shared state; the dialog submits the note; passage questions not shareable.

Notes (2026-10-11): the share action and dialog are in `apps/web/src/organisms/LessonShare` (an organism rather than a molecule, because it reads queries and posts), with `LessonSharePreview` and `LessonShareByline` ready for the C11d post card. The `myShares` update is written into the cached lesson and course reads from the create response (or the `409`'s `postId`, now kept on `ApiError.body`) rather than before the request, since the post ID is only known then. Sharing is offered when the cached course is not archived and the lesson is published with a published document, so editors' previews and unpublished lessons show nothing. Selection lives in `LessonDocument` (`renderShare`); a press inside a dialog keeps it, so the confirmation can open. In the player a dialogue's steps share the whole dialogue. A reading practice's questions show a disabled Share pointing to one note above them (in the player, the note sits beside the button). The share dialog's form stops its submit from reaching the answer set's form through the portal. `DialogueTurns` was split out of `DialogueBlock` so a share can render turns without a block. Tokens: `--share-select-outline`, `--share-select-outline-width`, `--share-select-outline-offset`, `--color-share-card`. `PostCard` already uses `LessonShareByline` for share posts, because the byline keys became an object; their content cards remain C11d. Tests: `apps/web/src/organisms/LessonShare/LessonShare.test.tsx`.

## C11d — Web: share posts in the journal

- [x] `PostCard` variants for the three kinds: example (sentence via `InlineText`, translation, note, speaker button), dialogue (turns with the existing `DialogueControls`, unavailable state), question (instruction and prompt, blanks as `…`). The note follows the existing post-notes concealment. Link to the lesson only while it is available.
- [x] Post page: the same content in full; the question kind adds the answer field(s) and check, reusing the practice answer components (per-blank fields, Enter to check, Matches the author's version, the author's version on a miss), with the `share-answer` local draft.
- [x] Composer: never offers `lesson_share`; the edit flow for a share post edits only the note.
- [x] RTL for each card and detail variant, including unavailable and fallback bylines; the answer check matches and misses with the shared matcher and sends no request.
- [x] Playwright: share an example from the lesson page, see it in the journal and open it; share a question from the Answer dialog, answer it on the post page, see a match; Already shared on a second attempt; `mobile-layout.spec.ts` for the share dialog and the share post page.

Notes (2026-10-11): in the feed only the share's byline is the link to the post and the piece follows it outside the link, since an example's speech button and inline links and a dialogue's transport cannot nest in a link; the feed card never links to the lesson, the post page does while `source.linked`. The post page's check adds a Check button beside Enter for touch, and a question with an incomplete author's version shows a note instead of a field. `practiceDraftKey` takes the `share-answer` kind. Editing a share post opens `ShareNoteForm` (`LessonShare/LessonSharePost.tsx`) instead of the composer, which already offered neither system type. Playwright found a C11c bug: the lesson page cleared a block's selection on `pointerdown`, so the Share row collapsed and moved the clicked control (Answer) before the click landed; it now clears on `click`. Tests: `apps/web/src/organisms/LessonShare/LessonSharePost.test.tsx`, `apps/web/e2e/lesson-shares.spec.ts`, and a share case in `apps/web/e2e/mobile-layout.spec.ts`.

## C11e — Storybook (local only)

- [ ] Add Storybook (latest, Vite builder, React) to `apps/web` with `pnpm --filter @wordinator/web storybook`. Decorators for Mantine with the app theme and `tokens.css`, the colour-scheme toggle, i18next, a memory TanStack router, and a fresh `QueryClient`. Speech uses static fixture URLs.
- [ ] Fixtures built from the contracts' response schemas (parsed, so stories break when contracts change) for every post variant: shared sentence, question, reading, fill-in, course (available and unavailable), and the example, dialogue (available and unavailable), and question shares, each with and without a note, as a feed card and as a post page.
- [ ] Stories for the share confirmation dialog (empty and prefilled note) and the Already shared button.
- [ ] Keep it out of `typecheck`, `test`, `build`, and deploy: separate scripts and tsconfig include, and `storybook-static/` git-ignored.
- [ ] Docs: `docs/testing.md` and `docs/operations.md` (how to run it locally).

## Release

- [ ] Type-check, Vitest, RTL, Playwright, and production builds for web and API on the release commit.
- [ ] Back up production D1, apply `0024` with an explicit `--remote`, deploy the API, then the web app.
- [ ] Smoke test: share each kind, check the feed bylines and audio, answer a shared question, unpublish the dialogue's lesson and see it unavailable while the example and question shares stay.
- [ ] Delete this file once C11 ships.
