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
- **Sharer's note.** The confirmation dialog has an optional plain-text note. When the block already has a learner-visible note, the field is prefilled with it and stays editable.
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

- [ ] Create `docs/lesson-shares.md` (share kinds, snapshot vs reference, entry points, confirmation and note, duplicates, availability, answer check, API) and add it to `docs/index.md`.
- [ ] `docs/posts-and-feed.md`: the `lesson_share` post type with its three kinds, the bylines, card previews, and the editing rule (the note is editable; the shared content is not).
- [ ] `docs/courses.md`: the share entry points on the lesson page, in the Answer and Practise again dialogs, and in the player; feed presence beyond the course post.
- [ ] `docs/data-model.md`: `posts.type` gains `lesson_share`; new `post_lesson_shares` table (below).
- [ ] `docs/discussions-and-reactions.md`: share posts take ordinary comments; the answer check publishes nothing.
- [ ] `docs/security-and-privacy.md`: snapshots outlive unpublishing; item notes are never shared; the server builds snapshots.
- [ ] CLAUDE.md and `docs/product-requirements.md`: the example-sentence rich-text exception (decision 2).
- [ ] `docs/testing.md`: Storybook is a local preview tool outside the release gates.
- [ ] `docs/roadmap.md`: C11 phase, approved 2026-10-11.

## C11a — Contracts and data

- [ ] Contracts: a `lessonShareKind` (`example` | `dialogue` | `question`); `createLessonShareRequest` (`courseId`, `lessonId`, `blockId`, `itemIndex` for a question, optional `note` ≤ 2,000 plain-text characters); snapshot schemas (example: inline content, translation, note, clip hash; question: instruction, prompt, author's version list, item index); a discriminated `lessonSharePost` in the post response union with the live/fallback byline fields, a dialogue's resolved turns and clip URLs, and `available`. Errors: `409 LESSON_SHARE_EXISTS` (with `postId`), `422 LESSON_SHARE_NOT_SHAREABLE` (passage practice, unknown block or item, wrong block type), plus the existing course and lesson visibility errors.
- [ ] Lesson reads gain `myShares`: the viewer's share keys mapped to post IDs, so the share action shows Already shared without another request.
- [ ] Migration `0024_lesson_shares.sql`: rebuild `posts` to allow `lesson_share` in the type check, using the `0012` approach (constraint-free copies of reading questions, expected answers, comments, response items, and pins, then restore). Add `post_lesson_shares`: `post_id` PK → posts cascade, `kind`, `course_id` → courses, nullable `lesson_id` → lessons `ON DELETE SET NULL`, `block_id`, nullable `item_index`, `share_key`, `author_id`, snapshot JSON (null for dialogue), `course_title` and `lesson_title` snapshots, with a unique index on `(author_id, share_key)` and an index on `lesson_id`. Update `packages/db/src/schema.ts`.
- [ ] Contracts and db unit tests: request validation, snapshot schemas, the share-key helper (prompt normalisation reuses `normalizeAnswer`).

## C11b — API

- [ ] `POST .../lesson-shares`: authenticate, require username setup, load the lesson's **published** document through the contracts' parser, check course visibility and not archived, find the block (columns included), refuse passage practices and out-of-range items, build the snapshot server-side (author's version kept, item note dropped, example clip hash from the speech key `example:{blockId}`), insert the post and the share row in one D1 batch, and map the unique-index violation to `409` with the existing post's ID. The note is plain text and never logged.
- [ ] Feed, profile list, post detail, and new-post polling resolve share posts: dialogue references read the block from the published document in SQL (`json_tree`, as practice counts do) or in a batched read, attach turn clip URLs from `speech_clips`, and mark them unavailable under decision 6. Keep the feed to a bounded number of queries per page.
- [ ] `PATCH` on a share post edits only the note; deletion follows the normal post rules and frees the share key.
- [ ] Workers tests: unauthenticated and not-set-up refused; draft-only, unpublished, archived, other-course, missing-block, wrong-type, passage, and out-of-range refused; client-sent content ignored; item note never present in the snapshot or response; duplicate gives `409` with the post ID; re-share after deletion; dialogue becomes unavailable after block removal, unpublish, lesson deletion, and archive, and back after republish; snapshot survives all of those; lesson deletion keeps snapshot posts; editing refuses content changes.

## C11c — Web: sharing

- [ ] A share molecule: the button (Share, or Already shared linking to the post) and the confirmation dialog, which previews the share in the same component the feed card uses, with the note field (prefilled per decision 1) and Share / Cancel. Use an optimistic `myShares` update and invalidate the feed.
- [ ] Lesson page: clicking an example or dialogue block selects it and reveals its share button; Escape or clicking elsewhere clears the selection. Clicks on interactive children (speech controls, links) do not select. It is keyboard-reachable: the block is focusable and Enter reveals the button. Hidden in draft previews and archived courses.
- [ ] Answer dialog and Practise again: a share button beside each question, disabled with an explanation for passage practices.
- [ ] Player: a share action on example, dialogue, and question steps, using the same dialog.
- [ ] i18next keys for every label, the three bylines, Already shared, and the unavailable states. Tokens in `docs/design-system.md` for the selected-block outline and share cards.
- [ ] RTL: selection and reveal by click and keyboard; no share in previews or archived courses; prefill rules; Already shared state; the dialog submits the note; passage questions not shareable.

## C11d — Web: share posts in the journal

- [ ] `PostCard` variants for the three kinds: example (sentence via `InlineText`, translation, note, speaker button), dialogue (turns with the existing `DialogueControls`, unavailable state), question (instruction and prompt, blanks as `…`). Sharer's note as plain text. Link to the lesson only while it is available.
- [ ] Post page: the same content in full; the question kind adds the answer field(s) and check, reusing the practice answer components (per-blank fields, Enter to check, Matches the author's version, the author's version on a miss), with the `share-answer` local draft.
- [ ] Composer: never offers `lesson_share`; the edit flow for a share post edits only the note.
- [ ] RTL for each card and detail variant, including unavailable and fallback bylines; the answer check matches and misses with the shared matcher and sends no request.
- [ ] Playwright: share an example from the lesson page, see it in the journal and open it; share a question from the Answer dialog, answer it on the post page, see a match; Already shared on a second attempt; `mobile-layout.spec.ts` for the share dialog and the share post page.

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
