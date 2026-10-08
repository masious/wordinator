# Testing strategy

Wordinator’s highest-risk failure is data crossing group boundaries. Tests should optimize for confidence in permissions and core flows, not maximal line coverage.

## Layers

### Unit tests — Vitest

Cover pure validation and domain behavior:

- Ellipsis-token counting and expected-answer matching
- Emoji grapheme validation and uniqueness
- Safe URL detection
- Draft-key/version construction
- Membership transition rules
- Notification trigger decisions
- Cursor encoding/ordering
- Permission predicates
- The lesson document schema (inline styles, safe links, callouts, columns, list depth, block count, size cap, unique IDs, dialogue, practice, and vocabulary payloads), its helpers (practice IDs, image URL mapping, learner stripping, publish problems including `word-empty`, player steps with every new-words attachment rule and its step keys, lesson word collection), the course words response, and the v1 block upgrade
- Practice item rules (one author's version entry per blank, at most one for open prompts) and the split of learner payload from reference

### API integration tests — Vitest and Workers test pool

Run Hono against isolated local D1 state using the Cloudflare Workers test environment. Cover repository queries, migrations, transactions/batches, signed cookies, route validation, and authorization failures.

Every group-owned endpoint needs at least one negative test using a valid member of a different group. Test nested-ID attacks where a valid group ID is paired with another group’s post/comment ID.

Settings administration adds these cases: ordinary members receive `403 CREATOR_REQUIRED` from the memberships read; pending requesters and another group's creator receive the tenant `404`; responses contain only the addressed group's rows, never email; decisions affect only pending rows in the addressed group; and `pendingRequestCount` is `0` for members.

Course routes add these cases: another group's course ID under the attacker's own valid group ID on every course route; former members; drafts hidden from non-owners in both the library and direct reads; owner-only editing, publishing, and cover changes, including attempts by the group creator; owner-or-creator archive and restore; archived courses hidden from other members; and `409` responses when an archived course is changed.

Lesson routes add: another group's lesson ID under the attacker's own valid group and course, and a lesson under the wrong course within one group; unpublished lessons hidden from readers and drafts never sent to learners; owner-only publish, discard, unpublish, and reordering, including attempts by the group creator; creator-only moderation deletes; stale draft versions, stale reorder lists, and limits; image keys from another group or lesson and practice IDs owned by another lesson; publish and discard cleanup of practice threads and images; and frozen archived courses. Migration `0015` has its own test: the v1 shape, including the course fixture, migrates to documents equal to `upgradeLegacyBlocks`, with counts, order, publish state, and thread links preserved.

Course posts add: exactly one post on first publication and none after unpublishing, republishing, archiving, restoring, or deleting the post; the unique course link rejecting a second post; course details hidden once the course is archived or returned to draft for non-owners; visible comments with no pins and no editing; and the composer refusing the `course` type; and another group's member reaching the post, its comments, or its reactions through their own group.

Course contributors add negative permission tests: a contributor publishing, discarding, or unpublishing a lesson, changing a published lesson's title or goal, reordering, deleting, or changing course details, visibility, or contributors; a non-contributor and a pending requester adding or editing content; former contributors who left or were removed adding, editing, or reading unpublished content; the group creator deciding requests for another member's course; accepting a requester who has left the group; contributor roles ended by group departure; duplicate pending requests; and another group's member or course ID on every contributor route.

Practice threads add: learner course and lesson reads that never contain authors' versions or notes while editors receive the reference; the reference delivered only by the thread endpoint; answer sets with blanks, wrong cardinality, and wrong kinds; one-level replies, reactions, and no pins, matching, or notifications; prompt snapshots that survive practice edits and constrain later edits; practice removal at publish and lesson deletion cascading to answers, replies, response items, and reactions; author-only edit and author-or-creator delete; frozen threads in archived courses; and another group's or another practice's block, lesson, course, and comment IDs under valid paths, including post comment routes.

### Component tests — React Testing Library

Cover visible behavior rather than implementation details:

- Composer type switching and draft preservation
- Concealed answers and explicit reveal
- Reading wizard progress/skipped answers
- Reaction toggling and custom emoji validation
- Responsive navigation states
- Pending/rejected and internet-required screens
- Notification links to deleted or concealed content
- Lesson document rendering per block type, escaping of hostile text, unsafe links, and columns; the lesson editor's autosave, local document draft, three-way merge and side-by-side choices, paste repair, image dialog, column limits, and publish bar
- Contributor panel requests, withdrawal, owner decisions, and confirmed removal; contributor editing of drafts without publish, discard, or reorder controls; contributor notification links
- Practice prompts rendered concealed, the local answer-set draft, publishing and revealing the thread with the author's version, and per-blank author's version fields in the editor

### End-to-end tests — Playwright

Maintain a small critical suite for current Chromium and WebKit:

1. Bootstrap-created creator signs in.
2. New user registers from an invite, waits, is accepted, and enters the group.
3. User creates each post type; another user answers without spoilers.
4. Reading wizard publishes one complete answer set.
5. Reactions, replies, and pinning work with correct permissions.
6. A user in group A cannot access group B resources by URL or API ID.
7. Leaving/removal preserves content and shows the correct status.
8. Soft-deleting/restoring a group restores access and membership.
9. A creator-generated password forces change without pretending to revoke existing sessions.
10. A learner answers a course practice, sees the thread and author's version revealed, replies, and finds the practice concealed again on the next visit.
11. Publishing a course shows its card in the feed; members comment openly on it and follow it to the course.
12. A member asks to contribute, the owner accepts, the contributor edits a lesson draft that autosaves without a publish option, and the owner publishes it for readers.
13. A learner starts a lesson, sees an example with its translation, sees dialogue lines arrive one at a time, answers a practice question, finishes the lesson, and sees their course percentage, the Practise again action, and their answer kept as the practice draft.
14. An author builds a lesson with headings, bold and coloured text, a callout, columns, an image with alt text, and a practice, publishes it, and another member reads it; two editors' concurrent edits merge.

## Fixtures

The Playwright database is reset only when `e2e/start-api.ts` starts the API, and local runs reuse a running server. Specs share the fixture group and must not assume it is empty; a spec that needs an empty journal creates its own group, as the visual baselines do through `e2e/emptyJournal.ts`. Do not run two Playwright sessions against the same checkout at once: they share `.wrangler/e2e` and the dev ports.


Use deterministic factories for at least two unrelated groups, multiple users, former/pending members, every post type, deleted targets, and a soft-deleted group. Never make tenant isolation tests depend on coincidentally sequential IDs.

`test/fixtures/courses/dutch-foundations-part-iii.json` is the normalized course acceptance fixture: sections became `heading` blocks, blanks use `…`, authors' versions are per-blank lists, the reading follow-up is its own practice block, and deferred placeholders and planning metadata are removed. Contract and API tests import all of its blocks, including its six practice blocks.

## Release gates

Before declaring a phase complete:

- Affected TypeScript projects type-check in strict mode.
- Relevant Vitest and component tests pass.
- Critical Playwright paths pass when user-visible flows changed.
- Both affected deployables build for production.
- Migrations apply to a fresh local D1 database and upgrade the previous schema state.
- Affected documentation is updated.

There is intentionally no lint or format gate.

## Implemented foundation harness

Phase 0 establishes the runnable test layers used by later phases:

- shared-contract unit tests run in ordinary Vitest;
- API integration tests run the Worker entry point in the Cloudflare Workers Vitest pool with an isolated D1 binding;
- web component tests run React Testing Library in jsdom with Mantine browser APIs shimmed in shared setup;
- Playwright starts both local applications and verifies `/api/health` through Vite in Chromium and WebKit.

Use `pnpm test` for unit, component, and Workers integration tests. Use `pnpm test:e2e` for the browser harness after installing the configured Playwright browsers as described in [operations.md](operations.md).

Phase 1 adds migrated D1 integration coverage for invitation registration and approval, signed cookies, forced password change, login throttling, and cross-tenant group access/creator decisions. The Playwright fixture uses `.wrangler/e2e` as a separate local persistence directory, resets only that test database, seeds a creator, and exercises invitation registration, approval, group creation/switching, and responsive mobile navigation in Chromium and WebKit.

Phase 2 adds shared-contract tests for single-grapheme emoji and three-reaction uniqueness; migrated Workers integration tests for settings persistence, active snapshot refresh, ordinary password verification, former-profile privacy, negative profile tenant access, and creator-only rename; and React Testing Library coverage for the settings form, direct profile layout, and empty post shell. The critical Playwright flow also updates profile settings, renames a creator-owned group, opens the profile directly through typed navigation, and verifies the empty post-list state in Chromium and WebKit.

Phase 3 adds shared-contract coverage for all four post discriminators, required reading questions, literal ellipsis blank counting, and expected-answer cardinality. Workers integration tests apply the post migration and cover structured child hydration, strict cursor order, older/newer queries, profile post lists, edit/delete permissions, and nested cross-tenant post IDs. React Testing Library covers cross-type state preservation, account/group/version draft scoping, and clearing only after successful publication. The Chromium/WebKit path publishes all four post types, checks concealed notes and reading detail, edits/deletes a fill post, and confirms posts appear on the author profile.

Phase 4 adds shared-contract coverage for discussion discriminators and composed emoji; migrated Workers integration tests for structured cardinality, skipped reading answers, positive-only fill matching, reply depth, edit/delete/pin permissions, idempotent reaction toggles, identity lists, self-reactions, and nested cross-tenant IDs; and React Testing Library coverage for conceal/reveal, reading progress/draft cleanup, and custom emoji validation. The Chromium/WebKit critical path has a second member answer without spoilers, publish a reading answer set with a blank response, self-react, and then verifies creator pinning and a one-level reply.

Phase 5 adds Workers integration coverage for directory/former snapshots, leave/remove permissions, cross-tenant IDs, one-time password regeneration, forced change, deleted-group status/restore, image validation, public reads, icon permissions, snapshot refresh, and replacement cleanup. React Testing Library covers active/former presentation and the one-time password result. Chromium/WebKit cover approval into the directory, forced password change, leaving, former attribution, and delete/restore. Because the pinned Workers pool has a macOS R2 isolated-storage sidecar defect, the single R2 suite runs in its own non-isolated single-worker config; D1 suites retain normal isolation.

Phase 6 adds Workers integration coverage for notification creation, recipient/group isolation, restricted removal status, read state, and deleted destinations. React Testing Library covers unread presentation, deleted-target copy, and group mark-all. The Chromium/WebKit discussion flow opens the on-demand notification page, marks a group read, and follows pin/reply delivery to the other member. Release verification must run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`; a real production smoke test remains an operator-recorded gate rather than an automated claim.

Course phase C1 adds Workers integration coverage for the course shell in `course-shell.test.ts` and an R2 cover suite in `course-media.test.ts`. The R2 suite runs in the same single-worker media config as the Phase 5 media suite. React Testing Library covers the library listing, the create form, owner publishing, confirmed archiving, and hidden controls for readers.

Course phase C2 adds `courses.test.ts` for the block contracts and fixture, `course-content.test.ts` for the lesson and block API, and `CourseLessons.test.tsx` for reader rendering, later-lesson loading, draft restore, dialogue editing, and keeping an edit through a version conflict.

Course phase C3 adds practice cases to `courses.test.ts`, `course-practice.test.ts` for practice threads, `PracticeBlock.test.tsx` for the practice reader and editor, and the Chromium/WebKit path `course-practice.spec.ts`. The Playwright fixture reset also clears course tables.

Course phase C4 adds `course-feed.test.ts` for course posts, course-post cases in `PostCard.test.tsx` and `PhaseFourPages.test.tsx`, and the Chromium/WebKit path `course-feed.spec.ts`. The Playwright fixture reset now clears posts before courses because course posts reference them.

Course phase C5 adds `course-contributors.test.ts` for the contributor lifecycle, permissions, notifications, and tenant isolation; `CourseContributors` cases in `CoursePages.test.tsx`; a contributor case in `CourseLessons.test.tsx`; a contributor notification link in `PhaseSixPages.test.tsx`; and the Chromium/WebKit path `course-contributors.spec.ts`. The Playwright fixture reset also clears `course_contributors`.

Course phase C6 adds `course-progress.test.ts` for idempotent completion, name ordering, published-only counting, unpublish and deletion effects, refusal of unpublished, hidden, and archived lessons, former members, unauthenticated access, and tenant isolation; lesson player cases in `CourseLessons.test.tsx` for stepping, hidden translations, one-by-one dialogue lines and questions, the shared answer draft, sharing, completion, and previews that record nothing; `CourseProgress.test.tsx` for the panel; and the Chromium/WebKit path `course-progress.spec.ts`. The Playwright fixture reset also clears `course_lesson_completions`.

Course phase C6b adds `Lesson positions` cases to `course-progress.test.ts` for saving and resuming, the never-shrinking passed share, private positions, completion clearing positions, replays that add nothing, key resolution after an edit, unknown and malformed keys, unpublished and deleted lessons, archived courses, non-members, other groups, and anonymous requests; contract cases for step keys and fallback resolution; `CourseLessons.test.tsx` cases for saving each move, resuming at a moved step, Start over, and previews that save nothing; and a leave-and-resume stretch in `course-progress.spec.ts`. The Playwright fixture reset also clears `course_lesson_positions`.

Course phase C8b adds `course-words.test.ts` for the `course_lesson_words` index (document order, draft edits that leave it alone, stale publishes, publish, discard, unpublish, republish, edit-then-publish, lesson deletion, and the `word-empty` refusal) and the course word recap (only finished, currently published lessons; lesson and document order after reordering; repeated terms; per-viewer results; draft and archived course visibility; non-members, former members, another group's course IDs, and anonymous requests). The Workers and Playwright fixture resets also clear `course_lesson_words`.

Course phase C8d adds a vocabulary case to `LessonDocument.test.tsx` (escaped word list, empty optional fields); `WordRecap.test.tsx` for stepping, per-card reveal, the done action, and collecting a run's words; `CourseLessons.test.tsx` cases for the New words panel on prose, example, both dialogue lines, both practice items, and a words-only step, the lesson recap with the completion recorded once, and the course recap shown only when the endpoint returns words; and `LessonEditor.test.tsx` cases (C8c) for editing a vocabulary block in place with autosave and for a `word-empty` problem focusing the empty field. C8c adds `VocabularyFields.test.tsx` (editing, dropping cleared optional fields, the details toggle, adding with a fresh ID, reordering, and never removing the last word), `lessonDraft.test.ts` cases for vocabulary surviving paste repair and for fresh word IDs on a pasted or duplicated block, and a `lessonMerge.test.ts` case asking side by side when both editors changed one vocabulary block. Playwright `course-words.spec.ts` (Chromium and WebKit) seeds a lesson with words through the API, checks the reader list and the player panels, reviews the lesson recap, and reviews the course recap without an unfinished lesson's words; a second case adds words with the New words slash item, follows the `word-empty` problem to the empty meaning, publishes, and reads the words; `mobile-layout.spec.ts` checks the panel and the recap stay within the viewport.

The lesson editor (C7) replaces the C2 block-editing cases in `CourseLessons.test.tsx` with document reading, draft previews, contributor actions, and document-based player steps. `LessonDocument.test.tsx` covers every block type, escaping of hostile text, unsafe links, colour tokens, and column widths; `LessonEditor.test.tsx` runs the real BlockNote editor in jsdom for draft loading, contributor and owner actions, focusable publish problems (including images), restoring a local edit, and keeping a conflicted edit; `useLessonAutosave.test.tsx` covers the 1.5 s debounce, version chaining, conflicts, and retry; `editorDictionary.test.ts` checks that every reachable BlockNote label comes from the catalog; `LessonImageDialog.test.tsx` covers the whole-image default, re-encoding within the size limit, crop shapes, refused uploads, and cancel; `lessonDraft.test.ts` and `crop.test.ts` cover preview-width rounding, column clamping and unwrapping, pasted-content repair (unsafe links, off-palette colours, alignment, foreign images), and the lesson image size cap. `lessonMerge.test.ts` covers the three-way merge: edits to different blocks, additions on both sides, move against edit in both directions, delete against unchanged and edited blocks, both sides editing one block, identical edits, editor defaults missing from stored documents, and blocks lifted out of deleted list items and column lists. `LessonEditor.test.tsx` also covers a merged `409` saved against the newer version, choosing a version side by side, pasted HTML stripped to the lesson subset, and a pasted image file opening the upload dialog. Playwright `course-merge.spec.ts` drives two editors of one lesson through a clean merge and a same-block choice. The R2 suite's `course-media.test.ts` covers lesson image upload validation, foreign keys, publish and discard cleanup, lesson deletion, and the scheduled sweep.

The Chromium/WebKit path `course-columns.spec.ts` (C7f) makes columns by dragging a block to another block's edge and by the three-column slash item, checks both survive a reload, and checks that a drag which would make a fourth column is refused (the block stays in place) before publishing and reading the columns side by side.

The settings split adds `settings-administration.test.ts` for the creator-only memberships read, pending counts, and scoped decisions; `SettingsPages.test.tsx` for the creator section navigation, member redirects, each Members section and empty state, accept, one-time passwords, and confirmed removal; `crop.test.ts` for crop geometry and zoom limits; and `ImageCropper.test.tsx` for cancel, output size for both frames, keyboard zoom and reset, and the upload-error retry state. `settings-split.spec.ts` covers the `/settings` redirect, an Account save, and an avatar upload through the cropper at desktop and phone widths in Chromium and WebKit, and the dual-theme containment gate includes the Group and Members settings pages.

The mobile layout path `mobile-layout.spec.ts` runs only in the `mobile-chromium` (Pixel 7), `mobile-narrow` (360px), and `mobile-webkit` (iPhone 13) Playwright projects; desktop projects ignore `mobile-*.spec.ts`. It seeds a long question post and a published course with a large cover, then asserts that the feed, post detail, courses, course detail, members, profile, notices, settings, and the open composer are never wider than the device viewport. It also covers the collapsed course outline toggle, checks that lesson columns stack, and steps the lesson player through an example, a two-line dialogue, a practice question, and the completion screen, asserting each step stays within the viewport. The assertion compares against the configured viewport width, not `innerWidth`, because mobile browsers widen the layout viewport to fit overflowing content. Set `MOBILE_SHOTS=<directory>` to save a screenshot per route and project.
