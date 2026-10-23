# Testing strategy

Wordinator’s highest-risk failures are unauthorized account access, unpublished lesson disclosure, and corruption of lesson documents or progress. Tests should optimize for confidence in permissions and core flows, not maximal line coverage. Each test file is the record of what it covers; this document holds the rules for writing tests, not an inventory of them.

## Layers

### Unit tests — Vitest

Cover pure validation and domain behavior in the shared contracts and pure modules:

- Ellipsis-token counting and expected-answer matching
- Emoji grapheme validation and uniqueness
- Safe URL detection
- Draft-key/version construction
- Notification trigger decisions
- Cursor encoding/ordering
- Permission predicates
- The lesson document schema (inline styles, safe links, callouts, columns, list depth, block count, size cap, unique IDs, dialogue, practice, and vocabulary payloads), its helpers (practice IDs, image URL mapping, learner stripping, publish problems, player steps and their step keys, lesson word collection), and the v1 block upgrade
- Practice item rules, the split of learner payload (prompts and authors' versions) from reference (notes), and the shared answer matching (`answerMatches`, `blankMatches`, `hasAuthorsVersion`)
- Speech items, voices, SSML, and clip hashes; word search key folding; the word memory engine and deck builder

### API integration tests — Vitest and Workers test pool

Run Hono against isolated local D1 state using the Cloudflare Workers test environment. Cover repository queries, migrations, transactions/batches, signed cookies, route validation, and authorization failures.

Every protected route needs negative tests: anonymous requests (`401`), unfinished account setup (`403`), and another account's or an unreadable resource's IDs. Test nested-ID attacks, where a valid outer ID is paired with an inner ID from somewhere else (a lesson under the wrong course, a block or practice from another lesson, a word from another lesson). Legacy tenant tests (another group's IDs, former members, creator-only rules) stay as long as the compatibility layer in [groups and membership](groups-and-membership.md#storage-compatibility) exists; new work does not add group-shaped cases.

Required negative cases per area:

- **Courses:** drafts hidden from non-owners in both the library and direct reads; owner-only editing, publishing, and cover changes, including attempts by the library record's creator; archive and restore by the owner or that creator; archived courses hidden and frozen (`409` on change).
- **Lessons:** unpublished lessons hidden from readers and drafts never sent to learners; owner-only publish, discard, unpublish, and reordering; stale draft versions, stale reorder lists, and limits; image keys and practice IDs owned by another lesson; publish and discard cleanup of practice progress and images.
- **Course posts:** exactly one post on first publication and none after unpublishing, republishing, archiving, restoring, or deleting the post; the composer refusing the `course` type.
- **Contributors:** a contributor publishing, discarding, unpublishing, reordering, deleting, or changing course details, visibility, or contributors; non-contributors and pending requesters editing; former contributors editing or reading unpublished content; duplicate pending requests.
- **Practice progress:** learner reads carry published authors' versions but never notes, draft-only versions, or unpublished lessons; counts only rise and are bounded by the number of questions; draft-only practices (`409` for editors, `404` for readers).
- **Learning data and the tutor:** see [AI tutor and learning data](#ai-tutor-and-learning-data-c14).

Migrations that reshape data (such as `0015`, `0022`, and the learning data seed) get their own test that the old shape migrates to what the current code would produce.

### Component tests — React Testing Library

Cover visible behavior rather than implementation details: composer type switching and draft preservation, concealed answers and explicit reveal, the reading wizard, reaction toggling and custom emoji validation, navigation states, notification links to deleted or concealed content, lesson document rendering (every block type, hostile text escaped, unsafe links, columns), the lesson editor (autosave, local draft, three-way merge and side-by-side choices, paste repair, image dialog, publish bar), lesson shares, practice answers checked on the device with no request, word cards, Drill, the Words tab, and the tutor.

- jsdom has no layout, so tests that depend on measured size mock the measurement (for example `measureFit` for word cards) instead of asserting on real geometry.
- Media playback is stubbed on `HTMLMediaElement`; speech recognition is stubbed through the Microsoft Speech SDK mock, which must fire the recognizer's `sessionStarted` like the real SDK.
- Streamed tutor turns are stubbed as `ReadableStream` server-sent events split mid-event.

### End-to-end tests — Playwright

Maintain a small critical suite for current Chromium and WebKit:

1. A bootstrap-created account signs in through the home page's "I already have an account" path (`e2e/auth.ts`).
2. A new person signs up, is held on account setup until a username is chosen (the avatar is optional), and lands on `/courses`; a second account cannot take the same username in another case; a repeated email is refused; retired `/invite/...` and `/groups/...` links redirect to the signed-out entry or the global equivalent.
3. Global shell navigation shows Courses, Words, Journal, and Tutor in the left rail on desktop, and the same rail in a drawer behind the slim header's Open navigation button below `68rem`.
4. A member creates each post type in the journal; another member answers without spoilers, completes a reading, reacts, and receives reply and pin notices.
5. Settings saves the profile and uploads an avatar through the cropper.
6. A learner opens a practice's answers with its Answer button, sees a miss keep focus with the author's version and a match reveal and focus the next question (without any check request), finishes later, finds the answer kept on the device after a reload, and is counted as done.
7. (Retired 2026-10-20 with the contributor UI; the e2e spec was removed. Contributor rules stay covered by API tests.)
8. An author builds a lesson with headings, formatted text, a callout, columns, an image with alt text, words, and a practice, publishes it, and another member reads it; two editors' concurrent edits merge.
9. A learner shares an example and a question to the journal, answers the question on its post page, and gets Already shared on a second attempt.
10. The tutor flow, AI practices, Weak words, and analytics access (see [AI tutor and learning data](#ai-tutor-and-learning-data-c14)).

Every UI decision ships a phone equivalent (see [product requirements](product-requirements.md#release-definition)); during the Lumen redesign its visual check is manual. The `mobile-*` specs run only in the `mobile-chromium` (Pixel 7), `mobile-narrow` (360px), and `mobile-webkit` (iPhone 13) projects and stay green, and changes to shared shell or layout code still run them, but new features add desktop Chromium/WebKit coverage only. `mobile-layout.spec.ts` asserts against the configured viewport width, not `innerWidth`, because mobile browsers widen the layout viewport to fit overflowing content; set `MOBILE_SHOTS=<directory>` to save a screenshot per route and project.

### Running Playwright

`pnpm test:e2e` runs every spec in every project (desktop specs in two browsers, `mobile-*` specs in three phone projects), so it is not the command for day-to-day work. Run only what the change touches:

- **While working:** the affected specs in one desktop project, for example `pnpm --filter @wordinator/web exec playwright test e2e/words-tab.spec.ts --project=chromium`. Spec names follow the area they cover: `course-*` and `lesson-*` for courses and lessons, `words-*` for the Words tab and Drill, `tutor*`, `ai-practices`, and `learning-data` for C14, `phase-*` and `visual-redesign-journal` for the journal, sign-up, and notices, `settings-split` for Settings.
- **Before calling the change done:** the affected specs in both `--project=chromium` and `--project=webkit`. Add the `mobile-*` projects when shared shell or layout code changed, and the visual gates (`dual-theme-gate`, `light-theme-gate`, `visual-baselines`, `ui-workbench`) when tokens or shared UI components changed.
- **The full `pnpm test:e2e`:** for a release, and when changing shared e2e code (`auth.ts`, `editor.ts`, `global-setup.ts`, `start-api.ts`, `aiStub.ts`, `lessonSeed.ts`, `speech.ts`, `tutor.ts`, `wordRecap.ts`) or the Playwright configuration.

Only one Playwright run at a time per checkout (see [Fixtures](#fixtures)).

## Fixtures

Every table a feature adds must be cleared by both fixture resets: `resetDatabase` in `apps/api/test/courseApi.ts` for Workers tests and the reset in `apps/web/e2e/global-setup.ts` for Playwright, ordered so referencing rows go first. Fixtures that insert courses or lessons directly must set a slug.

`test/fixtures/courses/dutch-foundations-part-iii.json` is the normalized course acceptance fixture: sections became `heading` blocks, blanks use `…`, authors' versions are per-blank lists, and the reading follow-up is its own practice block. Contract and API tests import all of its blocks, including its six practice blocks.

The Playwright database is reset only when `e2e/start-api.ts` starts the API, and local runs reuse a running server. Specs share the fixture library record and must not assume it is empty.

Playwright runs fully parallel: 4 workers locally and 2 on CI, overridden with `E2E_WORKERS`. Every test shares one local worker, database, and seeded creator account, so specs follow these rules:

- Tag everything a test creates (course titles, post bodies, emails, usernames) with `uniqueTag(testInfo)` from `e2e/auth.ts`. Never read the first card that matches non-unique text.
- Register a fresh account with `registerAccount` (API) when a test reads the viewer's own newest-first lists, or changes account-wide state such as the avatar; register one with `registerLearner` (UI) for a second person in a flow.
- Navigate after a client-side redirect only once the destination page has rendered: WebKit treats a history change that is still settling as interrupting the next `page.goto`.
- Put the caret in the lesson editor with `caretToEnd` from `e2e/editor.ts`, never a click plus `End`.
- Match a button's accessible name exactly when other buttons repeat it (each lesson's play button names its lesson; the lesson index repeats practice instructions).
- Write to the local D1 directly only through the seed lock in `e2e/speech.ts`: parallel `wrangler d1 execute` processes deadlock on the shared SQLite file. Speech specs insert `ready` `speech_clips` rows under the hashes the contracts compute and route `speech/*.mp3` to a generated clip.
- Fast-forward app polling with `page.clock` instead of waiting for it in real time.

The e2e API serves media from its own `/api/media/` route (`PUBLIC_MEDIA_BASE_URL` is overridden in `e2e/start-api.ts`) and starts with an empty `AZURE_SPEECH_KEY`, so no browser test reaches production media or Azure. Do not run two Playwright sessions against the same checkout at once: they share `.wrangler/e2e` and the dev ports. Separate checkouts (such as git worktrees) can run side by side with distinct `E2E_API_PORT` and `E2E_WEB_PORT` (defaults 8788 and 5174); the worker's inspector port is the API port plus 1000 and the AI stub's is the API port plus 2000.

## Harness

- Shared-contract unit tests run in ordinary Vitest.
- API integration tests run the Worker entry point in the Cloudflare Workers Vitest pool with an isolated D1 binding. Requests go through `fetchWorker` in `apps/api/test/worker.ts`, never `SELF.fetch`: the pool (0.8.71, unfixed through 0.23.0) wraps `SELF`'s entrypoint prototype in one more Proxy per request, so every request in a file gets slower and long files time out, then fail with `Isolated storage failed`. `fetchWorker` calls the entry point's `fetch` with its own execution context, and the shared setup waits for each test's `waitUntil` work after the test.
- Suites that write to R2 (`vitest.r2.config.ts`) run in a non-isolated single-worker config because the pinned pool has a macOS R2 isolated-storage sidecar defect; D1 suites keep normal isolation.
- A full API run can exhaust local ports on macOS; run the files in batches as described in [Workers tests and port exhaustion](workers-tests-port-exhaustion.md).
- Web component tests run React Testing Library in jsdom with Mantine browser APIs shimmed in shared setup.
- Playwright starts both local applications and verifies `/api/health` through Vite in Chromium and WebKit.

Use `pnpm test` for unit, component, and Workers integration tests. Use Playwright as described in [Running Playwright](#running-playwright) after installing the configured Playwright browsers as described in [operations.md](operations.md).

## Release gates

Before declaring a phase complete:

- Affected TypeScript projects type-check in strict mode (`pnpm typecheck`).
- Relevant Vitest and component tests pass (`pnpm test`).
- The affected Playwright specs pass in Chromium and WebKit when user-visible flows changed, as described in [Running Playwright](#running-playwright); a release runs the full `pnpm test:e2e`.
- Both affected deployables build for production (`pnpm build`).
- Migrations apply to a fresh local D1 database and upgrade the previous schema state.
- Affected documentation is updated.

A real production smoke test remains an operator-recorded gate rather than an automated claim. There is intentionally no lint or format gate.

## Storybook

Storybook previews every journal post variant, the lesson share action, and the AI tutor's messages and answer components. It is a local development tool and is not built for or deployed to production. The production `/ui` route remains the canonical, release-gated visual inventory described in the [design system](design-system.md). [Operations](operations.md#storybook) has the commands.

- Fixtures (`stories/fixtures.ts`, `stories/tutorFixtures.ts`) are parsed with the contracts' schemas, so a story fails as soon as a contract change makes its fixture invalid.
- `apps/web/.storybook` and `apps/web/stories` are outside `tsconfig.app.json`, the Vitest include, and the Vite build; `tsconfig.storybook.json` is used only by `storybook:typecheck`.

An automated WCAG gate (`pnpm test:a11y`, the a11y addon with axe, light and dark, failing on WCAG 2.x A/AA violations) is paused as of 2026-10-17 and is not yet a release gate: the light run fails in the Storybook preview decorator before axe executes, so the dark run never starts. Later batches should add stories for their new pieces so they are covered once the gate runs.

## AI tutor and learning data (C14)

Covers the [AI tutor](ai-tutor.md), [word memory](words.md#word-memory), [practice attempts](courses.md#practice-attempts), and [reset](courses.md#reset). Every model call in tests goes through a stubbed `fetch`; no test reaches a real provider. Tutor Workers tests use the helpers in `apps/api/test/tutorApi.ts`: `scriptedAi` answers from a script at its own fake Azure AI Foundry host (pass its `env` to the request), and a server-sent-event reader.

- **Unit:** the memory engine (folding one review, rebuilding from reviews equals folding them one by one, recall decaying with time); the deck builder ranking by recall with new words at `WORD_NEW_RECALL`; the lesson state derivation (missed only behind a later started or completed lesson); the assistant Markdown subset (allowed marks, raw HTML and unsafe links shown as text); contracts for every component payload and answer, `aiSettingsSchema`, and the attempt and pronunciation bodies; deterministic component grading.
- **Workers integration:** every route refuses anonymous requests and unfinished setup; every route that takes a conversation, message, tool call, lesson, practice, or term ID refuses another account's IDs with `404`; tools never return another account's data or a lesson the account cannot read; attempts re-derive `matched` from the published author's version and ignore any client value; reset deletes exactly its scope (another lesson's reviews of a shared term survive and memory is rebuilt from them); lesson deletion removes attempts, reviews, and AI practice tags; a confirmed write never runs before its confirmation and a tool call is answered once; a skipped component records nothing and is answered once; the daily turn cap (`429 AI_DAILY_LIMIT` before any model call) and speech character cap (`429 SPEECH_DAILY_LIMIT`, cache hits counted); `ai_usage` rows on success and failure; fallback order on `429`, `5xx`, and timeout; on-demand speech reading only stored spans; AI practice anchors validated against the published document; and `403 SUPERUSER_REQUIRED` on every admin route for ordinary accounts.
- **React Testing Library:** streaming render into sections; tool step chips; confirmation states; each answer component, including keyboard use; target-language speaker buttons (loading, cached, limit); the daily-limit composer; the Weak words view; the Progress tab and both reset entry points; AI practices placement; Tutor settings; the hidden analytics link for ordinary accounts.
- **Playwright** (Chromium and WebKit; the tutor flow also at a phone width, its one exception to [desktop first](what_is_it.md#desktop-first)): ask for the next lesson, see the tool steps, answer a fill-in, confirm completion, and find the lesson completed on the Progress tab; reset a lesson; save and answer an AI practice; see Weak words dots after a drill; and an ordinary account cannot open analytics. `e2e/aiStub.ts` is the stub provider, started by `start-api.ts` and handed to the worker as Azure AI Foundry; every binding is local, so browser tests need no wrangler login. Global setup stores AI settings with only the stub on. The stub's replies are a pure function of the messages it receives.
- **C14l** ([tutor sessions and memory](tutor-sessions-and-memory.md)), required cases. Unit: topic keys; plan step transitions (never reopened, pending steps replaceable, one active plan, 24-hour expiry); short reference assignment and resolution; reading grading; tutor word reviews folding like lesson word reviews of the same term. Workers: every new route and tool refuses another account's plan, note, tutor word, personal practice, and reference with `404`; scope changes the snapshot but not tool access; `NOTES_FULL`, `WORD_IN_LESSON`, `TUTOR_WORD_EXISTS`, the 500 cap, and `TUTOR_WORD_NOT_SHAREABLE`; removing a tutor word deletes its reviews and observations and rebuilds memory; observations never change memory; personal practices invisible to everyone but their learner and kept by a reset. RTL: the Session panel, the plan part, the Context control, dated notes in Settings, From your tutor, the reading component, and the Just for you label. Playwright: plan a session with the stub provider, answer a step, see it ticked, and find the tutor word in Words.


## Section-aware lesson activities

v2 deployed to production 2026-10-21 ([ACTIVITIES_V2_PLAN.html](../ACTIVITIES_V2_PLAN.html)). [The owner](lesson-activities.md#verification) and [execution plan](../LESSON_ACTIVITIES_PLAN.html#proof) define acceptance. Contract tests cover section extraction/fingerprints, bounds and payload/view separation. Protected API tests require signed-out/setup-incomplete refusals, current published visibility, nested-ID attacks and cross-account run/answer isolation. Cache tests exercise duplicate opens, expired leases, stale source publication and failures. Role-play tests prove held recording never auto-sends, cue modes, typed fallback, explicit continuation and microphone/audio cleanup. Clock/reset tests must prove no double counting and no required-progress or word-memory effects beyond the rule in [lesson activities](lesson-activities.md). Stub model/speech services deterministically for browser flows, then manually smoke-test real microphone permission and cast audio before release.

The test files are `packages/contracts/src/lessonActivities.test.ts`, `apps/api/test/lesson-activities.test.ts`, `apps/api/test/lesson-activities-migration.test.ts`, `apps/web/src/organisms/LessonActivities/LessonActivityPage.test.tsx`, `apps/web/src/organisms/LessonActivities/RoleplayActivity.test.tsx`, `apps/web/src/organisms/CourseLessons/LessonBox.test.tsx`, and the browser spec `apps/web/e2e/lesson-activities.spec.ts`. Planned v2 coverage, owned by [lesson activities](lesson-activities.md#verification), adds the guided grammar progress write, metrics before and after, speaking lines, and the completion Up next. Both fixture resets (`courseApi.ts` and `global-setup.ts`) clear `lesson_activities`, `lesson_activity_runs`, `lesson_activity_answers`, and `ai_turn_reservations`. The Playwright API keeps its own `.wrangler/e2e` state, separate from the development database.
