# AI tutor plan (C14)

Working plan for the AI tutor and the learning data it reads: word memory with full review history, stored practice attempts and pronunciation scores, the lesson progress tab with reset, the Weak words view, AI-generated practices, and the superuser analytics page. C14.0 moves every rule below into its owning document; after that this file holds delivery steps only and links to the owners. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed on 2026-10-15 now live in their owning documents (C14.0, completed 2026-10-16). Change the owner, not this file:

- [docs/ai-tutor.md](docs/ai-tutor.md): entry point (`/ai`, the `/courses` CTA, the mobile exception), conversations and archiving, formatting, tools and visible steps, confirmation, answer components (first and later sets), next lesson, tutor profile, providers and fallback, limits, prompt injection, API.
- [docs/words.md](docs/words.md#word-memory): word memory and the review log (replacing Leitner boxes), the [Weak words view](docs/words.md#weak-words-view), deck ranking by recall, [stored pronunciation scores](docs/words.md#pronunciation-assessment).
- [docs/courses.md](docs/courses.md): [block ID stability](docs/courses.md#editor-and-format), [practice attempts](docs/courses.md#practice-attempts), [lesson states](docs/courses.md#lesson-states), the [Progress tab](docs/courses.md#lesson-progress-tab), [reset](docs/courses.md#reset), [AI practices](docs/courses.md#ai-practices).
- [docs/speech.md](docs/speech.md#on-demand-audio): on-demand audio, its caching and character cap.
- [docs/data-model.md](docs/data-model.md#learning-data): every new table, `users.is_superuser`, `platform_metadata.ai_settings`, and the dropped `course_word_drill_states`.
- [docs/security-and-privacy.md](docs/security-and-privacy.md#ai-tutor): what is stored, what each provider receives, OpenRouter logging, and the accepted trade-offs.
- [docs/settings-and-administration.md](docs/settings-and-administration.md#current-settings-page): Tutor settings, the superuser, analytics, AI settings.
- [docs/architecture.md](docs/architecture.md#ai-tutor-and-learning-data), [docs/operations.md](docs/operations.md#superuser-command), [docs/design-system.md](docs/design-system.md), [docs/testing.md](docs/testing.md#ai-tutor-and-learning-data-c14), [docs/user-flows.md](docs/user-flows.md#study-with-the-ai-tutor), [docs/what_is_it.md](docs/what_is_it.md), [docs/product-requirements.md](docs/product-requirements.md), and [docs/roadmap.md](docs/roadmap.md#course-phases).

The three open assumptions were adopted as decisions in C14.0: AI practices are visible to everyone who can read the lesson and removable by the owner and contributors; Drill's Weak words draws from word memory plus bookmarks (lowest recall first, never-reviewed words at 0.5, bookmarks as a tiebreak); native language, reply language, and goals live in a Tutor section in Settings, and the tutor may rewrite its own notes (the learner can clear them).

Details C14.0 and later phases settled beyond the agreed list (confirmed 2026-10-16):

- The tutor is the one exception to desktop-first: same features and tests on phones.
- Say it needs the Microsoft recognizer (assessment is Azure-only); with the browser recognizer it says so.
- Leitner seed mapping: box 1–5 → stability 0.5, 1, 3, 7, 21 days.
- Weak words rows get an I know this word action (sets `known_override`; a later Again clears it).
- A web reset also clears the lesson's local practice drafts on that device; archived courses refuse reset.
- Pronunciation attempts survive reset; journal share answer checks are not recorded.
- AI practices are unattributed (labelled AI practice) and count toward no progress.
- New account-level routes live under `/api/ai/...` and `/api/admin/...`; lesson-bound routes stay under the group compatibility prefix.
- Default speech cap 5,000 characters per UTC day; turn cap 0–500, speech cap 0–100,000.
- The tutor never receives the learner's username.
- Weakness ranks by recall projected 7 days ahead (`WORD_WEAK_HORIZON_DAYS`), and a direction whose latest result is Again is capped at `WORD_LAPSE_RECALL` (0.4), so fresh mistakes rank before never-reviewed words (C14d).

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C14.0 — Docs and decisions (completed 2026-10-16)

- [x] New owner [docs/ai-tutor.md](docs/ai-tutor.md): entry point, conversations and archiving, formatting, tools and their visibility, confirmation, interactive components, next lesson, providers and fallback, the daily cap, and prompt-injection rules. Add it to [docs/index.md](docs/index.md).
- [x] [docs/speech.md](docs/speech.md): on-demand clips for assistant messages, their voice, caching, and metering.
- [x] [docs/words.md](docs/words.md): word memory (replacing Leitner boxes), the review log, the Weak words view, Drill ordering from memory, stored pronunciation scores.
- [x] [docs/courses.md](docs/courses.md): stored practice attempts, lesson states including missed, course completion, the lesson progress tab, reset, AI practices on the lesson page, and block ID stability.
- [x] [docs/data-model.md](docs/data-model.md): every table under C14a, C14e, C14f, and C14h; drop `course_word_drill_states`.
- [x] [docs/security-and-privacy.md](docs/security-and-privacy.md): on-demand speech of assistant text (and its quota guard), what is stored, what is sent to each provider (lesson content, the learner's words, attempts, memory, profile; never posts, comments, credentials, or other users' data), OpenRouter free models possibly logging prompts, and the accepted trade-off.
- [x] [docs/settings-and-administration.md](docs/settings-and-administration.md): the superuser flag, analytics, AI settings, and the Tutor settings section.
- [x] [docs/architecture.md](docs/architecture.md), [docs/operations.md](docs/operations.md) (secrets, the Workers AI binding, the superuser command), [docs/design-system.md](docs/design-system.md) (CTA, chat surfaces, tool steps, answer components, dots), [docs/testing.md](docs/testing.md), [docs/user-flows.md](docs/user-flows.md), [docs/what_is_it.md](docs/what_is_it.md) (the no-scores non-goal narrows), and [docs/roadmap.md](docs/roadmap.md) (C14).
- [x] Mark `CLAUDE.md` product invariants that change: rich text stays limited to lessons, plus the assistant's markdown subset.

## C14a — Learning data foundation (completed 2026-10-16)

- [x] Migration and schema:
  - `word_reviews`: id, user_id, term_key, course_id, lesson_id, word_id, direction, result (`got` | `again`), source (`drill` | `ai_chat` | `ai_practice` | `seed`), conversation_id, created_at. Indexed by `(user_id, term_key, direction, created_at)` and `(user_id, lesson_id)`.
  - `word_memory`: primary key `(user_id, term_key, direction)`; the representative lesson and word ID, `recent` (last 10 results as a bit string), reps, lapses, last_lapse_at, stability, difficulty, last_reviewed_at, known_override.
  - `practice_attempts`: id, user_id, course_id, lesson_id (nullable), practice_kind (`lesson` | `ai`), practice_id, item_index, prompt, answer, reference, matched (nullable), ai_verdict (`acceptable` | `error`, nullable), ai_note, source (`lesson` | `ai_chat` | `ai_practice`), conversation_id, created_at.
  - `pronunciation_attempts`: id, user_id, surface (`drill` | `word_card` | `ai_chat`), reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness, word_scores JSON, created_at.
  - `progress_events` (audit only, no undo): id, user_id, actor (`user` | `agent`), kind, course_id, lesson_id, conversation_id, created_at.
  - None of the new tables has `group_id`, per [storage compatibility](docs/groups-and-membership.md#storage-compatibility).
- [x] Pure memory engine (in the API, beside `wordDrill.ts`): fold one review into a memory row, rebuild a row from its reviews, recall probability at a time. Evaluate `ts-fsrs` against a small in-house version; the decision goes in the notes.
- [x] Seed migration: one `seed` review per existing drill state, memory rows from the boxes, then drop `course_word_drill_states`.
- [x] Drill: grading writes a review and updates memory in one batch; the deck builder ranks by recall probability instead of box tiers.
- [x] Lesson deletion removes the new rows explicitly in its batch.
- [x] Tests: engine unit tests (fold, rebuild equals incremental, recall decay); Workers tests for grade → review + memory, seeding, another account's rows never read, deck order from memory.

### Notes

- **Memory engine: in-house, not `ts-fsrs`.** `apps/api/src/wordMemory.ts` is about a hundred lines of FSRS-4.5 (its published default weights, the power forgetting curve `R = (1 + 19/81 · t/S)^-0.5`, recall and forget stability, and mean-reverting difficulty) with two grades, Again = 1 and Got it = Good = 3. `ts-fsrs` (5.4, about 700 KB unpacked; checked against its current docs) is built around scheduling cards: due dates, learning steps, card states, fuzz, and four ratings, none of which Wordinator shows or needs, while the parts we need are a few formulas. Writing them in-house keeps the Worker bundle small, keeps every result deterministic so a rebuild equals incremental folding and migration `0026` can mirror the seed fold in SQL, and avoids tracking a scheduler library's version changes. Times are fractional days, so same-day reviews fold without `ts-fsrs`'s short-term terms.
- **Seed box column.** `word_reviews.seed_box` (only on `seed` rows) keeps each seeded drill state's box, so rebuilding a seeded term after a reset or lesson deletion reproduces its box stability instead of guessing. A seed sets stability from its box and the default difficulty (Good's initial difficulty, 5.1618) and is never counted as a lapse.
- **Unkeyed words when seeding.** SQLite cannot fold diacritics, so the migration takes the term key from `course_lesson_words.term_key`; a word indexed before `0023` and never keyed since falls back to its lower-cased trimmed term only when that term is plain single-spaced ASCII (exactly what `wordSearchKey` gives), and other unkeyed words, and states of words no longer in the index, are skipped. The drill deck now runs the word search's lazy key fill before reading, and the grade route keys a missing index key with `wordSearchKey` in the Worker.
- **Helpers for later phases** (`apps/api/src/learningData.ts`): `recordWordReviews(db, userId, reviews)` appends reviews (sources `drill`, `ai_chat`, `ai_practice`) and upserts their memory in one batch, returning the new rows by `` `${termKey}\n${direction}` ``; `memoryRebuildStatements(db, keys, { withoutLessonId })` returns statements to put after the deletes in a reset or deletion batch; `lessonMemoryKeys(db, lessonId, userId?)` lists the keys a lesson's reviews touch; `rebuildMemory(db, userId, termKeys)` rebuilds both directions directly. `recentResults(recent, 5)` in `wordMemory.ts` turns a row's `recent` into the contracts' `wordRecentResultsSchema` shape. `known_override` survives a rebuild; a later Again clears it.
- **Not done here:** the drill setup still disables Weak words without bookmarks (memory alone does not enable it yet); C14d's weak words read can expose whether the learner has memory.

## C14b — Capturing attempts and pronunciation (completed 2026-10-16)

- [x] Contracts and API: `POST .../practice-attempts` (one checked item; the server re-derives `matched` from the published author's version and never trusts the client's), and `POST .../pronunciation-attempts`.
- [x] Web: the lesson Answer dialog, Practice again, and the player record an attempt on each answer check; drill cards and Words tab word cards record Microsoft assessments. Local drafts stay as they are.
- [x] Tests: validation, ownership, visibility, matched re-derived; RTL that a check posts once and a failed post does not block the learner.

### Notes

- **Route and shapes.** The practice route is `POST .../lessons/:lessonId/blocks/:blockId/attempts`, as [docs/courses.md](docs/courses.md#practice-attempts) names it. Bodies live in `packages/contracts/src/learning.ts` (subpath `@wordinator/contracts/learning`): `practiceAttemptRequestSchema` (non-strict, so a client's `matched` is dropped, not refused), `pronunciationScoresSchema` (reusable by the tutor's Say it), `pronunciationAttemptRequestSchema`, and the source, kind, verdict, and surface enums.
- **Draft-only practices** answer `409 PRACTICE_NOT_PUBLISHED` for editors and `404` for readers, exactly like progress (the practice resolver is shared). An empty answer is a `400`, since the web never sends one.
- **Pronunciation term key.** With a lesson and word (required together), the API takes the term key from the published index (falling back to `wordSearchKey` of the term) and ignores the body's; without them it stores the body's `termKey` as is, for the tutor.
- **Helpers for later phases** (`apps/api/src/learning/attempts.ts`): `insertPracticeAttempt(db, row)` and `practiceAttemptStatement(db, row)` (for a batch) take `NewPracticeAttempt` with `practiceKind`, `source`, `aiVerdict`, `aiNote`, and `conversationId`; `lessonPracticeCheck(item, answer)` gives the prompt, reference (blanks joined by ` · `), and server match; `insertPronunciationAttempt(db, row)`. `app.ts` only calls `registerAttemptRoutes(app, { requireGroupAccess, practiceBlock, readableLesson: drillLesson })` and exports its `AppEnvironment` type.
- **Web.** `AnswerField` takes `onCheck`, called once per changed, non-empty whole-item check (an item with nothing to check counts when it moves on; blank-by-blank checks do not). `AnswerSetComposer` records only with `recordAttempts`; the lesson page passes `published && !archived`, Practice again (absent in archived courses) passes the published document, and `LessonPlayer` takes an optional `archived` prop. Journal share checks pass no `onCheck`. Sending (`molecules/learningAttempts.ts`) is a bare `fetch` that ignores the result, since the routes answer `204` without a body. `SpeechRecognitionScope` takes `onAssessment`; `useSpokenAnswer(term, onAnswer, word?)` calls it with the reference text after the card shows the verdict. The Words page posts `word_card`, the drill page `drill`.
- **Not covered by RTL:** the drill page's Microsoft path (its tests have no Azure SDK mock); it shares the scope code covered by the Words tab test.

## C14c — Lesson progress tab and reset (completed 2026-10-16)

- [x] API: a course progress read with derived lesson states (including missed), storyline share, practices done of total, words reviewed of total, AI practice count, and course completion. Add `POST .../lessons/:lessonId/reset`, which deletes in one batch, rebuilds affected memory rows, and writes a `progress_events` row.
- [x] Web: the Progress tab on the single course page with a confirm dialog for Reset. The lesson page gets a Reset button that confirms and returns to the course's lesson list.
- [x] Tests: the missed derivation, completion with missed lessons, reset scope (other lessons' reviews of a shared term survive), negative authorization; RTL for both reset entry points.

### Notes

- **A sibling read, not a wider one.** `GET .../courses/:courseId/progress/lessons` (`lessonProgressResponseSchema`) serves the Progress tab, so the course progress read the lesson list and the lesson page poll stays as cheap as before and its fixtures are unchanged. Reset returns the existing course progress payload; the web then invalidates the course key, which refreshes both reads.
- **Helpers for the tutor (C14g)** in `apps/api/src/learning/progress.ts`, all trusting an already-authorized target `{ groupId, courseId, lessonId, userId }`: `readLessonProgress(db, { groupId, id }, userId)` returns the Progress tab payload (`complete`, `publishedLessons`, `completedLessons`, `missedLessons`, and per lesson `lessonId`, `slug`, `title`, `state`, `storylinePercent`, `practicesDone`/`practicesTotal`, `wordsReviewed`/`wordsTotal`, `aiPracticeCount`, `practiceIds`); `completeLesson(db, target, { actor, conversationId? })` (caller checks archived `409` and published `409 LESSON_UNPUBLISHED`); `resetLesson(db, target, { actor, conversationId? })` (caller checks archived and readability). The pure `deriveLessonStates` and `courseComplete` live in `apps/api/src/learning/lessonStates.ts`.
- **AI practice seam.** `aiPracticeCounts(db, lessonIds)` in `progress.ts` returns an empty map, so `aiPracticeCount` is 0; C14h counts `ai_practice_lessons` rows there.
- **Drafts.** The read carries each lesson's practice block IDs (from `course_practices`), and the lesson page reads them from the lesson's documents, so a web reset removes exactly that lesson's `practice-answer` drafts on the device.
- **Words reviewed** counts index rows whose `term_key` has a memory row for the viewer; a row still without a term key (indexed before `0023` and not yet lazily keyed) counts as not reviewed.
- The lesson page shows Reset lesson for any published lesson in a course that is not archived, even before the learner started it, since reviews and attempts can exist without a position.

## C14d — Weak words view (completed 2026-10-16)

- [x] API: a cursor-paginated weak words read from `word_memory`, ordered by the shared weakness ranking (see notes), each with its last 5 results and lesson context; `PUT`/`DELETE .../word-memory/:termKey/known`.
- [x] Web: a Weak words view on the Words tab with 5 dots per word (got, again, empty), and Drill from this list.
- [x] Tests: ordering with time decay, known_override excluded; RTL for the dots and empty state.

### Notes

- **Weakness ranking projects a week ahead.** With the FSRS curve a word graded Again moments ago has recall about 1 *now*, so ranking by recall now put it after never-reviewed words for days. `wordWeakness(state, now)` and `compareWordWeakness` in `apps/api/src/wordMemory.ts` rank by recall `WORD_WEAK_HORIZON_DAYS` (7) days ahead, then the longest since last reviewed; the deck builder (`wordDrill.ts`) and the Weak words read (`apps/api/src/weakWords.ts`) both use them. Owners: [docs/words.md](docs/words.md#word-memory).
- **Lapse cap** (lead, at merge): a word whose latest result in a direction is Again is capped at `WORD_LAPSE_RECALL` (0.4) in `wordWeakness`, so a Got it then Again ranks before never-reviewed words; this resolves the earlier known limitation.
- **The view ranks reviewed directions only.** A term's row ranks by its weaker *reviewed* direction; an unreviewed direction does not count as 0.5 there (it still does in a mixed deck), so a well-known word drilled one way is not pinned at 0.5.
- **Order and cursor.** The read loads the viewer's memory rows and the visible occurrences of their term keys and orders them in the Worker; the cursor is `[at, recall, lastReviewedAt, termKey]` (base64 JSON), so later pages are computed at the first page's time. `recent` comes from `word_reviews` (last five per term across both directions, a window query), since each row's `recent` string has no times to merge by.
- **"I know this word" is per term.** `recordWordReviews` now also clears `known_override` on both directions of any term it records an Again for, in the same batch; the fold already cleared the graded direction.
- **`hasMemory`** on every weak words page enables Weak words in the drill setup without bookmarks (the C14a open item). Contracts live in `packages/contracts/src/weakWords.ts` (`@wordinator/contracts/weak-words`).
- **Drill these words** starts a mixed Weak words drill (there is no stored direction setting to reuse).

## C14e — Superuser and analytics (completed 2026-10-16)

- [x] Migration: `users.is_superuser` (default false). A `pnpm` script grants and revokes by email and requires `--local` or `--remote`.
- [x] API: superuser-only analytics reads (active users, lessons completed, drill reviews, practice attempts, AI usage per user and provider by day, and speech requests and characters per user by day). AI settings are stored in `platform_metadata` under `ai_settings` (provider order, model per provider, daily cap) with a contracts schema.
- [x] Web: an `/admin/analytics` route linked from Settings for superusers only, with an AI settings form.
- [x] Tests: `403` for non-superusers on every route; settings validation; RTL for the page and the hidden link.

### Notes (C14e)

Delivered as migration `0028_superuser.sql`, `scripts/superuser.mjs` (`pnpm superuser`), `apps/api/src/admin/` (routes mounted at `/api/admin` after the session middleware; queries in `analytics.ts`), the `@wordinator/contracts/admin` subpath, `AuthUser.isSuperuser` on the session read, and `apps/web/src/pages/AdminAnalyticsPage.tsx` with the `/admin/analytics` route. Behavior is in [settings and administration](docs/settings-and-administration.md#analytics).

- **Shape.** Each read returns `daily` (one zero-filled row per UTC day of the range) and `accounts` (totals over the range, by username); AI adds `models` (totals per provider and model). Per-account-per-day rows were left out: at a few friends' scale the daily totals plus range totals answer the questions without 90 × accounts rows. Response objects are strict in the contracts, so a text field added by mistake fails the contract.
- **Active accounts** count any non-seed review, practice or pronunciation attempt, saved position, lesson completion, or tutor turn start that day. Lessons completed come from `course_lesson_completions.completed_at` (the current completion, not the audit log), since `progress_events` is not yet written by every completion path.
- **The CLI's argument parsing** is a pure exported function tested with Node's built-in runner (`node --test scripts/`); no root test script runs it yet.
- The Workers fixture reset (`apps/api/test/courseApi.ts`) now also clears `ai_usage` and `speech_usage`, whose user foreign keys do not cascade.

## C14f — Provider layer and metering

- [x] One OpenAI-compatible chat-completions client with three configured targets: OpenRouter, Workers AI's OpenAI-compatible endpoint (via the `ai` binding), and Azure Foundry. Verify each target's tool-calling and streaming format with current docs before building.
- [x] Fallback through the configured order on 429, 5xx, or timeout. Only tool-calling models are allowed.
- [x] `ai_usage`: id, user_id, conversation_id, provider, model, tokens_in, tokens_out, cost_microusd, ok, created_at. Enforce the daily turn cap before the first model call.
- [x] `speech_usage`: id, user_id, surface (`ai_message`; later others), clip_hash, characters, cached (a cache hit costs nothing at Azure), created_at. A daily per-user character cap in `ai_settings`.
- [x] Secrets (`OPENROUTER_API_KEY`, `AZURE_AI_ENDPOINT`, `AZURE_AI_KEY`) are Worker secrets. Never log prompts, answers, or keys.
- [x] Tests: fallback order, cap refusal (`429 AI_DAILY_LIMIT`), usage recorded on success and failure, against a stubbed fetch; speech usage recorded for misses and cache hits.

### Notes (C14f, 2026-10-16)

Delivered as a library layer in `apps/api/src/ai/` (no routes), migration `0027_ai_usage.sql`, and the `@wordinator/contracts/ai` subpath. Tests: `apps/api/test/ai-provider.test.ts`, `apps/api/test/ai-metering.test.ts`, `packages/contracts/src/ai.test.ts`.

**Verified formats.** `ctx7` could not reach its service from the sandbox, so these were checked on the providers' own pages:

- OpenRouter ([streaming](https://openrouter.ai/docs/api-reference/streaming), [errors](https://openrouter.ai/docs/api/reference/errors-and-debugging.mdx)): `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer`, OpenAI request body. The stream sends SSE comment lines (`: OPENROUTER PROCESSING`) to be ignored; a mid-stream error is a chunk with a top-level `error` and `choices[0].finish_reason: "error"` under HTTP 200; the usage chunk repeats `finish_reason` and carries `usage.cost` (USD), which we store as the request's cost.
- Azure AI Foundry ([v1 API](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/api-version-lifecycle)): `POST https://<resource>.services.ai.azure.com/openai/v1/chat/completions` (or `.openai.azure.com`), no `api-version`, `api-key` header, `model` is the deployment name. Standard OpenAI chunks; the first chunk may have empty `choices` (prompt filter results) and the `stream_options.include_usage` chunk has empty `choices`.
- Workers AI ([OpenAI compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), [function calling](https://developers.cloudflare.com/workers-ai/features/function-calling/traditional/), [llama-4-scout](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/), [qwen3](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/), and the `workers-ai-provider` stream parser): the `/ai/v1/chat/completions` REST endpoint needs an account API token, so the binding is used instead: `env.AI.run(model, { messages, tools, stream: true })` with OpenAI-format messages and `{ type: "function", function }` tools, resolving to an SSE byte stream. Depending on the model, chunks are native (`{ response, tool_calls, usage }`, a tool call complete as `{ name, arguments }` with object arguments) or OpenAI chunks (`choices[0].delta`); the parser accepts both. The binding takes no abort signal and throws errors without an HTTP status (`3040` capacity, `5006`/`5007`/`8001` invalid input); invalid-input errors are treated as `400`, anything else as retryable. Assumption to recheck when C14g first runs against the real binding: the exact native chunk shape of the chosen model.

**Decisions.**

- **Fallback** moves on `429`, `5xx`, `408`, `401`/`403` (a refused key is that provider's configuration), network failure, a mid-stream error, or a timeout (20 s to the first event, 120 s in all), but only while the attempt has streamed no text; after text has been streamed, a failure ends the request with `AiRequestError(partial: true)`. Other `4xx` statuses throw `AiRequestError` without fallback. No provider configured, or all failed retryably: `AiUnavailableError` (`503 AI_UNAVAILABLE`).
- **Turn counting.** `ai_usage.turn_start` marks the first model request of a turn. The tutor calls `assertDailyTurnCap` once per turn (a user message or a component/confirmation answer that resumes the model), then passes `turnStart: true` to the turn's first `streamChat` call and `false` to the further calls of its tool loop. Only the first attempt row carries the mark, so fallback attempts are not counted twice; a failed turn still counts; a turn that reached no provider writes no row and does not count.
- **Speech cap** refuses a request when today's characters plus the request's would exceed the cap (cache hits count); call `assertDailySpeechCap` before serving and `recordSpeechUsage` after.
- **Cost.** OpenRouter's reported `usage.cost` wins; otherwise `AI_MODEL_PRICES` in `apps/api/src/ai/usage.ts` (USD per million tokens; tokens × that is micro-USD), `:free` models cost 0, and an unlisted model is metered at 0. Azure entries are keyed by deployment name.
- `conversation_id` has no foreign key (the conversations table is the tutor migration's, and conversations are never deleted).
- Default models (superuser replaces them): `openai/gpt-oss-120b:free`, `@cf/meta/llama-4-scout-17b-16e-instruct`, and the Azure deployment `gpt-4.1-mini`.

**Helper API for C14g (tutor) and C14e (admin):** `streamChat(request, options)` (async generator of `text`, `tool_call`, and a final `done` with provider, model, finish reason, usage), `completeChat`, `assertDailyTurnCap(db, userId, settings, now?)`, `assertDailySpeechCap(db, userId, settings, characters, now?)`, `recordSpeechUsage(db, input, now?)`, `readAiSettings(db)`, `writeAiSettings(db, settings, now?)`, and `aiErrorResponse(context, error)`; contracts export `aiSettingsSchema`, `DEFAULT_AI_SETTINGS`, `aiProviderSchema`, `aiLimitErrorSchema`, and the usage record schemas.

## C14g — Tutor API (completed 2026-10-16)

- [x] Tables:
  - `ai_conversations`: id, user_id, title, archived_at, created_at, updated_at.
  - `ai_messages`: id, conversation_id, user_id, role, parts JSON (`text`, `tool_call`, `tool_result`, `component`, `confirmation`), status (`complete` | `awaiting_user` | `error`), provider, model, created_at. Cursor-paginated by `(conversation_id, created_at, id)`.
  - `learner_profiles`: user_id, native_language, reply_language, goals, tutor_notes, updated_at.
- [x] Routes: list, create, archive, and unarchive conversations; read messages; `POST .../messages` streams the turn over SSE (text deltas, tool steps, components, confirmations); `POST .../tool-calls/:id/respond` answers a component or a confirmation and resumes the loop.
- [x] Agent loop: a compact learner snapshot (profile, recent lessons, in-progress lessons, weakest words, recent misses) in the system prompt; everything else through tools, each scoped to the signed-in account and the lessons it can read:
  - Read tools: `search_words`, `get_weak_words`, `get_recent_words`, `get_course_progress`, `get_lesson` (by ID or `next`), `get_recent_mistakes`, `list_ai_practices`.
  - Interactive tools: `ask_fill_in`, `ask_translate`, `ask_word_order`, `ask_article`, `ask_choice`, `ask_quick_review`, `ask_say_it`, `ask_dictation`, `ask_fix_mistake`. Each component's payload and answer have a contracts schema. Deterministic kinds (fill in, word order, article, choice, dictation) are graded by the server. Open kinds (translate, fix the mistake) compare with the reference and then take the model's verdict into `ai_verdict`. The server grades each answer, writes attempts and reviews, and returns the result to the model.
  - Confirmed writes: `complete_lesson`, `reset_lesson`, `save_ai_practice`.
  - Unconfirmed writes: `record_word_review` (only for answers given in this conversation), `update_tutor_notes`.
- [x] `POST .../messages/:messageId/speech` with `{ spanIndex }`: resolves the span from the stored assistant message (never from client text), synthesizes it through the existing speech pipeline synchronously or returns the cached clip, records `speech_usage`, and enforces the character cap (`429 SPEECH_DAILY_LIMIT`).
- [x] Prompt injection: lesson text and tool results go to the model as quoted data; every progress or content change needs the user's confirmation; tools never accept another user's ID.
- [x] Tests: auth and ownership on every route; tools never reach another account or an invisible lesson; a confirmation is required before a write; a component answer writes an attempt; archive is permanent and reversible; streamed events against a stubbed provider.

### Notes (C14g)

Delivered as migration `0029_ai_tutor.sql` (+ Drizzle `aiConversations`, `aiMessages`, `learnerProfiles`), the `@wordinator/contracts/tutor` subpath, `apps/api/src/tutor/` mounted at `/api/ai`, `onDemandClip` in `apps/api/src/speech.ts`, and `apps/api/src/courseVisibility.ts` (the course visibility SQL moved out of `app.ts`, plus an account-level variant). Behavior is in [docs/ai-tutor.md](docs/ai-tutor.md); tests are listed in [docs/testing.md](docs/testing.md#ai-tutor-and-learning-data-c14).

- **For C14i (web): contracts.** Everything is in `@wordinator/contracts/tutor`: `tutorConversationSchema`/`...PageSchema`/`...ResponseSchema`, `tutorMessageSchema`/`tutorMessagePageSchema` (newest first), the public `tutorPartSchema` (`text` with `spans`, `tool_call`, `tool_result` with `ok`/`error`/`detail`, `component` with `kind`/`view`/`answer`/`grade`/`answeredAt`, `confirmation` with `summary`/`answer`/`outcome`/`answeredAt`, and `error`), `tutorComponentViewSchema` (what each of the nine components renders), `tutorComponentAnswerSchema` (what each sends), `tutorGradeSchema` (`correct`, `matched`, `verdict`, `note`, `reference`, `items`, `score`), `tutorConfirmationSummarySchema`, `tutorRespondRequestSchema`, `tutorSpeechRequestSchema`, `tutorProfileSchema`/`updateTutorProfileRequestSchema`, `TUTOR_NATIVE_LANGUAGES`, `TUTOR_SPAN_MAX`, `parseTargetSpans`, and `messageSpanTexts`.
- **For C14i: the SSE protocol.** Both turn routes answer `text/event-stream` with `event: <type>` and `data: <JSON>` (validate with `tutorStreamEventSchema`). Order: `user_message` (new message) or `answered` (respond: the answered part with its grade or outcome; replace that part in the cached message and mark it `complete`), `start` (`messageId` of the assistant message being written), then `text` deltas (raw, still with `[[...]]` marks: run `parseTargetSpans` on the text so far and show spans without speaker buttons until `done`), `tool_call` / `tool_result` (pair by `toolCallId`; a new text part starts after each step), at most one `component` or `confirmation` (the turn then waits), an optional `error` (`AI_UNAVAILABLE`, `AI_REQUEST_FAILED`, `TURN_LIMIT`), and always `done` with the stored message, which replaces everything streamed. Pre-stream refusals are ordinary JSON errors (`409 CONVERSATION_ARCHIVED`, `409 TURN_IN_PROGRESS`, `409 TOOL_CALL_ANSWERED`, `400 ANSWER_INVALID`, `404 TOOL_CALL_NOT_FOUND`, `429 AI_DAILY_LIMIT` with `resetsAt`). The stream needs `fetch` with a reader (it is a `POST`), not `EventSource`. A component's `view` never holds the reference; `grade.reference` reveals it after answering. `GET /api/ai/conversations/:id` reads one conversation (added for the route loader).
- **For C14i: speech.** `POST .../messages/:messageId/speech` with `{ spanIndex }` (the span's index in `messageSpanTexts(message.parts)`) or `{ toolCallId }` (Say it, Dictation) answers `{ url }`, `202 { status: "pending" }` (retry after a second, at most five times), `429 SPEECH_DAILY_LIMIT`, `503 SPEECH_UNAVAILABLE` (hide speaker buttons for the visit), or `503 SPEECH_FAILED`.
- **For C14h: grading.** The pure grader is `gradeTutorAnswer(component, answer, view?)` in the contracts (`ANSWER_INVALID` for misfits; `needsVerdict` for an unmatched open answer), with `applyVerdict` and `componentAttemptText`. The API wraps it in `gradeComponentAnswer(component, answer, view, judge)` with `modelJudge(streamChatOptions & { language, explainIn })` in `apps/api/src/tutor/grading.ts`; `recordComponentAnswer(db, { userId, source: "ai_practice", practiceId, conversationId: null, component, answer, grade })` in `recording.ts` writes the attempt, reviews, and pronunciation attempt. AI practice payloads are `aiPracticeContentSchema` (`{ kind, payload }` for the seven kinds), and `saveAiPracticeArgsSchema` is the tool's arguments. `tutorComponentView` gives the public view of a payload (use it for the lesson-page read so references stay hidden, or send the payload if lesson practices' client-side checking is preferred). `apps/api/src/tutor/index.ts` re-exports these.
- **For C14h: the seam.** `apps/api/src/tutor/aiPractices.ts` holds `saveAiPractice(db, { userId, conversationId, practice, lessons: [{ lessonId, courseId, afterBlockId }] })`, which now always returns `{ ok: false, error: "AI_PRACTICES_UNAVAILABLE" }`, and `listAiPractices(db, lessonId)`, which returns `[]`. The tool already validates the practice, resolves every lesson as readable, published, and not archived, shows the card, and re-resolves on confirm; C14h validates `afterBlockId` against the published document (`ANCHOR_NOT_FOUND` is already in the result type), inserts in one batch, and returns `{ ok: true, practiceId }`. The card outcome and the model then see success. On-demand speech of an AI practice dictation is still to add beside the tutor's speech route.
- **Decisions.** Spans are marked `[[...]]` by the model and parsed on the server when a text part is stored. Tool call IDs are our own UUIDs (the provider's are discarded), used in the model history too. A component without a lesson writes no practice attempt (`practice_attempts.course_id` is required); its answer stays in the conversation. Reviews from answers: correct → Got it, otherwise Again; produce direction except multiple choice (understand); Say it records no review. Say it passes at overall 60. The judge request is never a turn start, so the turn counts once, on the resumed loop's first request. Archived courses: readable, but no attempts, reviews, or progress changes. The library is the account's oldest active library record (`accountLibrary`), used for the voice and the weak words read; lessons are readable across any active library of the account.
- **Not covered here:** two `POST .../messages` arriving at once can both start a turn (only an awaiting component or card blocks a new one); the Playwright reset (`apps/web/e2e/global-setup.ts`) does not clear `ai_usage` and `speech_usage` (non-cascading user FKs, from C14f) — the new tutor tables cascade from users, so C14j only needs to add those two. Real-provider tool calling and the Workers AI native chunk shape remain to be checked when the tutor first runs against a real binding (C14f note).

## C14h — AI-generated practices (completed 2026-10-16)

- [x] Tables: `ai_practices` (id, kind `fill_in` | `translate` | `word_order` | `article` | `choice` | `dictation` | `fix_mistake`, payload JSON per contracts, created_by_user_id, conversation_id, created_at) and `ai_practice_lessons` (practice_id, lesson_id, course_id, after_block_id, position; primary key `(practice_id, lesson_id)`).
- [x] `save_ai_practice` validates that every `after_block_id` exists in the lesson's published document. A missing anchor at read time places the practice at the end of the lesson.
- [x] Lesson read includes the AI practice count. A separate read returns the practices with their anchors. Owners and contributors can remove a tag.
- [x] Web: a Show AI practices (n) button on the lesson page that expands each practice after its anchor block, answered with the same components and recorded as `ai_practice` attempts.
- [x] Tests: anchor validation, multi-lesson tags, removal permissions, visibility (API); RTL for the expander and placement (web).
- [x] Skip a waiting tutor component (reported by C14i): `{ type: "component", skip: true }` on the respond route and a quiet Skip in the chat.

### Notes (C14h API, 2026-10-16)

Delivered as migration `0030_ai_practices.sql` (+ Drizzle `aiPractices`, `aiPracticeLessons`; the migration also rebuilds `speech_usage` so its surface check accepts `ai_practice`), `apps/api/src/tutor/aiPractices.ts` (seam filled), `apps/api/src/learning/aiPracticeRoutes.ts`, `apps/api/src/tutor/onDemandSpeech.ts` (shared by both speech routes), and contracts in the `tutor` subpath. Behavior is in [docs/courses.md](docs/courses.md#ai-practices); tests in `apps/api/test/ai-practices.test.ts`. The web expander followed (see Notes (C14h web)).

- **For the web expander: routes** (under `/api/groups/:groupId/courses/:courseId/lessons/:lessonId`). `GET .../ai-practices` → `lessonAiPracticesResponseSchema` `{ practices: [{ id, kind, afterBlockId | null, view, createdAt }], canRemove }`, already in reading order (null anchor = end of the lesson; render each after its `afterBlockId` block). `POST .../ai-practices/:practiceId/answer` with `aiPracticeAnswerRequestSchema` `{ answer }` → `aiPracticeAnswerResponseSchema` `{ grade, recorded }` (`400 ANSWER_INVALID`, `404 AI_PRACTICE_NOT_FOUND`). `POST .../ai-practices/:practiceId/speech` (no body, dictation only) → `{ url }`, `202 { status: "pending" }`, `429 SPEECH_DAILY_LIMIT`, `503 SPEECH_UNAVAILABLE` / `SPEECH_FAILED`, as the tutor's speech route. `DELETE .../ai-practices/:practiceId` → `{ ok: true }` (`403 COURSE_EDIT_FORBIDDEN`, `409 COURSE_ARCHIVED`). The lesson read's `aiPracticeCount` (optional in `courseLessonSchema`, treat missing as 0) drives the Show AI practices (n) button. Views are the tutor component views, so the C14i components render them directly.
- **Decisions.** An answer is recorded under the lesson it was answered on (the stored payload's `lessonId` is overridden), so attempts and resets follow that lesson. Answers can be repeated. Archived courses grade but record nothing (`recorded: false`). The open-kind judge is metered with `turn_start` false and no conversation; it is skipped (comparison only, no verdict, not accepted) when no provider answers or the account has reached its daily turn cap, so the lesson page cannot run unbounded model calls. Word order views are shuffled with a generator seeded by the practice ID, so every read offers the same chunks; grading checks the chunks against the payload. An unpublished lesson shows no AI practices and counts 0, but its tags are kept and removable by editors. `ai_practices.created_by_user_id` cascades from the user; `conversation_id` has no foreign key.
- **Not covered here:** saving trusts the tutor to have validated the payload with the contracts (a stored payload the contracts later refuse is skipped on read).

### Notes (C14h web, 2026-10-16)

Delivered as `apps/web/src/organisms/CourseLessons/AiPractices.tsx` (+ `.module.css`, `.test.tsx`), `lessonAiPracticesQueryOptions` and `lessonAiPracticesPath` in `api.ts`, a `renderAfterBlock` option on `LessonDocument`, `loadClip` in `organisms/Tutor/tutorApi.ts` (shared by the tutor's and the practices' speech routes), and the `courses.lessons.aiPractices` and `tutorComponents.skip*` i18n keys. Behavior is in [docs/courses.md](docs/courses.md#lesson-pages) and [docs/ai-tutor.md](docs/ai-tutor.md#answer-components); tests in [docs/testing.md](docs/testing.md#ai-tutor-and-learning-data-c14).

- **Renderer hook.** `LessonDocument`'s `renderAfterBlock(blockId)` is called once for every block ID of the document, at any depth, in reading order: after a list item inside its `<li>`, at the end of a column, after a column list, and for blocks the reader leaves out (New words blocks with `vocabulary={false}`, trailing blank paragraphs, children of blocks that show none) where they would have been. Slots sit outside the `data-block-id` anchor elements, so position tracking, the lesson index, and word highlighting are unchanged. No other surface passes it.
- **Lesson page.** `LessonView` holds the expanded state (per lesson, never stored) and reads the list only while expanded; a lesson without a published document counts 0, so draft previews show no button. `LessonView` takes the library `language` for the microphone (`CoursePages` passes it from the session). Each card wraps its component in its own `SpeechRecognitionScope`. An answer is sent once per expansion; answering again needs Hide and Show (the API accepts repeats). Removal updates the cached list and the lesson's `aiPracticeCount` in the lesson and course reads, and invalidates the Progress tab.
- **Skip.** `tutorRespondRequestSchema` accepts `{ type: "component", skip: true }`; the respond route stores the part with `answer: null`, `grade: null`, `answeredAt`, and `skipped: true` (optional in the part schema, so older parts still parse), records nothing, gives the model `{ status: "skipped" }` as the tool message, and resumes the turn. `record_word_review` ignores skipped components. In the web, `AnswerComponent` takes `onSkip` and `ComponentFrame` renders the quiet Skip while there is no stored answer (so Say it's needs-Microsoft state has it too); the chat collapses a skipped part to "Skipped · kind".
- **Not covered here:** no Playwright for the expander (C14j); the lesson page gets no phone-specific layout for practices (desktop first).

## C14i — Tutor web (completed 2026-10-16)

- [x] A colourful CTA on `/courses`, and a `/ai` route with a conversation list (active and archived) and the chat. Responsive, so mobile has every feature.
- [x] Message rendering: plain text for the user; a safe markdown-subset renderer for the assistant with small sections (no raw HTML, only `http`/`https` links). Target-language spans get a speaker button that requests on-demand speech and plays through the shared `Speech` element.
- [x] Tool steps as compact chips with an expandable detail; Confirm / Cancel cards.
- [x] Answer components:
  - Fill in the blank.
  - Translate into Dutch with a microphone through `useSpokenAnswer`, with the answer window extended for sentences (the current `MAX_ANSWER_MS` targets single terms).
  - Word order with click-to-place and drag, keyboard accessible.
  - De or het (two large toggle buttons per noun), Multiple choice (keyboard 1–4), Quick review (reusing the drill card), Say it and Dictation (on-demand audio plus the recognizer or a text field), Fix the mistake (a pre-filled editable sentence).
- [x] Settings: a Tutor section (native language, reply language, goals). The daily-limit state is shown in the composer.
- [x] All copy goes behind i18next keys; tokens only, no raw values.
- [x] Tests: RTL for streaming render, sections, on-demand speech (loading, cached, limit), chips, confirmation, each component, archive, limit state.

### Notes (C14i)

Delivered as `apps/web/src/routes/ai.tsx`, `pages/TutorPage.tsx`, `organisms/Tutor/` (`Chat`, `Messages`, `Markdown`, `ConversationList`, `TutorSettings`, `TutorCta`, `tutorApi`), `organisms/TutorComponents/`, the tutor query options in `api.ts`, the `tutor`, `tutorComponents`, and `tutorSettings` i18n blocks, and `--gradient-tutor` in `tokens.css`. Behavior is in [docs/ai-tutor.md](docs/ai-tutor.md); tests are listed in [docs/testing.md](docs/testing.md#ai-tutor-and-learning-data-c14).

- **Route.** The open conversation is a search parameter, `/ai?conversation=<id>`, not a path segment: a new conversation is created by the first message (`POST /api/ai/conversations` then the message), and keeping one route means the page and its streaming turn stay mounted while the URL gains the ID. The loader warms `GET /api/ai/conversations/:id` and swallows a `404`, which the page shows as unavailable.
- **For C14h: the TutorComponents API** (`apps/web/src/organisms/TutorComponents/index.tsx`). `AnswerComponent({ view, answer, grade, onAnswer, disabled?, clip?, language?, autoFocus? })` renders any view; each kind is also exported (`FillInComponent`, `TranslateComponent`, `WordOrderComponent`, `ArticleComponent`, `ChoiceComponent`, `QuickReviewComponent`, `SayItComponent`, `DictationComponent`, `FixMistakeComponent`) with `AnswerComponentProps<K>`. `view` is the contracts' `TutorComponentView`; `answer` and `grade` are the stored ones (with an answer the component is read-only, and the grade shows in place once present); `onAnswer(answer)` sends the contracts' `TutorComponentAnswer` once (a rejected promise re-opens the component with an error line, a resolved one keeps it locked until `grade` arrives). For a lesson page grading on the client, call `gradeTutorAnswer` in `onAnswer` and pass the result back as `grade`. Audio is a `ClipSource` (`{ key, load: () => Promise<ClipResult> }`, results `ready`/`pending`/`limit`/`unavailable`/`failed`); `ClipButton` does the `202` retries, caching, and hiding, so an AI practice dictation only needs its own `load` for its speech route. Answer components need a `SpeechRecognitionScope` around them for the microphone (the tutor page passes the library locale and `speechRecognitionTokenSource`).
- **`useSpokenAnswer`** takes an optional fourth argument, the answer window: `WORD_ANSWER_WINDOW` (unchanged, the default) or `SENTENCE_ANSWER_WINDOW` (1.8 s of quiet, at most 20 s). `MAX_ANSWER_MS` is unchanged.
- **Drill card.** `WordDrillCard` hides its course · lesson line when the card has no course title (Quick review cards carry none); Quick review sets `--size-drill-card` to `--size-word-card-roomy` in its own scope.
- **Say it with the browser recognizer** shows the needs-Microsoft message and a Use Microsoft on this device button (the recognizer preference) instead of offering Translate: the component waits for its answer, so a new message is refused with `TURN_IN_PROGRESS` and there is no route to decline a component (C14h added Skip for this).
- **Older messages** load with a Show earlier messages button rather than on scroll.
- **Not covered here:** a decline or skip for a waiting component (an API change; added in C14h); Azure's own segmentation silence for long Translate answers through Microsoft (`recognizeOnceAsync` may end a paused sentence early; only the app-side window was extended); phone-width checks are left to C14j's Playwright run (RTL cannot lay out CSS).

## C14j — Critical paths and release

- [x] Playwright with a stubbed provider: ask for the next lesson → steps visible → a fill-in answered → confirm complete → the Progress tab shows it; reset from the lesson page; the Weak words dots; superuser analytics hidden from others.
- [ ] Type-check, Vitest, Workers, RTL, Playwright, and production builds for web and API. Apply migrations to local, then production with the explicit target.
- [ ] Release notes and roadmap status.

### Notes (C14j, 2026-10-16)

- **Browser tests delivered:** `tutor.spec.ts`, `mobile-tutor.spec.ts`, `ai-practices.spec.ts`, and `learning-data.spec.ts` with the stub provider `e2e/aiStub.ts` (see [docs/testing.md](docs/testing.md#ai-tutor-and-learning-data-c14)). The Playwright reset clears `ai_usage` and `speech_usage` (the C14g gap) and stores AI settings with only the stub on. The e2e worker runs without the Workers AI binding (`apps/api/wrangler.e2e.json`), so browser tests need no wrangler login.
- **Production migrations:** `0026`–`0030` were applied to production with `--remote` (03:17 UTC) and the API deployed (03:32 UTC). `0031_conversation_provider.sql` (per-conversation model choice, committed in `9639961`) is applied locally, not yet in production.
- **Not covered by tests:** the Workers AI native chunk shape and real-provider tool calling (the stub speaks OpenAI chunks only); check them by hand against the real providers after the release.

## C14l — Tutor sessions and memory

Requested and decided 2026-10-16. Runs after C14j and before C14k. Behavior is owned by [docs/tutor-sessions-and-memory.md](docs/tutor-sessions-and-memory.md); change the owner, not this list.

Decided 2026-10-16:
- Practice history comes from data: `ask_*` calls carry a `topic`, stored on attempts and reviews; notes become dated entries (with follow-up dates) for what data cannot say.
- Words taught outside lessons are private **tutor words** that share word memory by term key; reviews and memory rows reference a lesson word or a tutor word. The tutor's free-chat impressions are separate **observations** that never change memory.
- Practices built around tutor words are **personal**: shown on the lesson page to that learner only.
- A session is a **dated plan inside the chat**, several per conversation; the session panel shows the active plan and earlier ones with counts, never right-and-wrong numbers.
- The context scope is chosen **per conversation**, with defaults in Settings.
- The prompt names IDs with short references (`L3`, `W12`) to cut snapshot tokens (UUIDs cost ~22–25 tokens each).

- [x] Docs and decisions: new owner [docs/tutor-sessions-and-memory.md](docs/tutor-sessions-and-memory.md) in [docs/index.md](docs/index.md); [ai-tutor.md](docs/ai-tutor.md), [words.md](docs/words.md), [courses.md](docs/courses.md), [data-model.md](docs/data-model.md), [settings-and-administration.md](docs/settings-and-administration.md), [security-and-privacy.md](docs/security-and-privacy.md), [design-system.md](docs/design-system.md), [architecture.md](docs/architecture.md), [user-flows.md](docs/user-flows.md), [testing.md](docs/testing.md), and [roadmap.md](docs/roadmap.md).
- [ ] Migration and contracts: the new tables and columns in [data-model.md](docs/data-model.md#tutor-sessions-and-memory) (moving `tutor_notes` into `learner_notes`); `tutorContextScopeSchema`, `tutorPlanStepsSchema`, the reading payload, view, and answer, `topic` on every payload, tutor word references in `words`.
- [ ] Memory engine: reviews of tutor words; rebuild on tutor word removal; Weak words, Drill's Weak words, and the From your tutor view.
- [ ] Tutor API: short references; the scoped snapshot (time, turns left, active plan, due follow-ups, topics, tutor words, earlier plans); the new tools; lesson-less attempts; the plan, context, notes, and tutor word routes; personal practices on the AI practice routes; the prompt's guidance on plans, pacing by turns left, notes and follow-ups, topic reuse, tutor words, and observations.
- [ ] Web: the Session panel and plan part, Plan a session, the Context control and dialog, dated notes and Default context in Settings, Words → From your tutor, the reading component, Just for you practices.
- [ ] Tests as listed in [docs/testing.md](docs/testing.md#ai-tutor-and-learning-data-c14); type-check, all suites, production builds, local migration; roadmap status.

**Interaction with C14k:** profiles never show plans, notes, topics, tutor words, observations, or personal practices; lesson-less tutor answers count as answered AI questions without a course.

## C14k — Profile activity

Requested 2026-10-16. **Secondary priority:** it runs last, after C14j, and has its own tests and release step. It needs C14c (`progress_events`, lesson states), C14g (tutor completions), and C14h (AI practices).

Decided 2026-10-16:
- Each user's page shows their activities. **Profiles and activity are visible to signed-in accounts that have completed setup only**, never to signed-out visitors, and pages send `noindex`. This replaces the earlier "publicly available" decision; the public-profile non-goal stays.
- **No opt-out:** activity is always shown, and there is no Settings switch.
- Only the fact that an activity happened is shown. **Answers, mistakes, scores, weak words, practice or test results, and conversations are never shown on profiles.**
- The page shows the person's progress in every course they have started.
- Small activities are reported, and repeats are combined, e.g. "Masoud completed 3 lessons and is on lesson 8/12 of Dutch Foundations".
- Activity types:
  - lesson completed (marked "with the tutor" when the tutor recorded it);
  - course progress and course completed;
  - answering AI-generated questions, both tutor components and AI practices on lesson pages (counts only);
  - drill sessions.
- A lesson reset removes that lesson's completion from the activity.
- C14l's plans, notes, topics, tutor words, observations, and personal practices are never shown; lesson-less tutor answers count as answered AI questions without a course.

**Conflicts to reconcile in the first step.** Each one reverses a recorded decision:
- [profile pages are retired](docs/profiles-and-settings.md#profile-pages-retired);
- C14.0 made progress [private to the learner](docs/security-and-privacy.md#account-and-profile-privacy).

- [ ] Docs and decisions:
  - A new owner `docs/profiles-and-activity.md` covering the signed-in profile route, activity types, grouping, visibility, reset, and what is never shown.
  - Reverse the conflicting rules above in [security-and-privacy.md](docs/security-and-privacy.md), [courses.md](docs/courses.md#progress), [words.md](docs/words.md#word-memory), and [profiles-and-settings.md](docs/profiles-and-settings.md).
  - Update [what_is_it.md](docs/what_is_it.md) only to note signed-in profiles beside the unchanged public-profile non-goal.
  - Update [data-model.md](docs/data-model.md), [architecture.md](docs/architecture.md), [design-system.md](docs/design-system.md), [user-flows.md](docs/user-flows.md), [testing.md](docs/testing.md), and [roadmap.md](docs/roadmap.md).
- [ ] Profile page:
  - `/people/:username`, for signed-in, set-up accounts.
  - Bylines (posts, comments, contributors, editor attribution) link to it.
  - The header shows the avatar, display name, `@username`, and bio. Email and quick reactions stay hidden.
  - A Courses section shows progress in each course started (percentage and "lesson N/M").
  - An Activity list, newest first, in cursor pages.
- [ ] Activities are derived at read time from `progress_events`, lesson completions, positions, `practice_attempts` (sources `ai_chat` and `ai_practice`), and drill reviews, plus a new `progress_events` kind `course_completed` written when the last lesson completes. Activity reads return counts and names only, never answer text, results, or scores.
- [ ] Grouping:
  - Consecutive activities of the same kind in the same course, with no other activity between them and within a UTC day, combine into one item.
  - Examples: "completed 3 lessons and is on lesson 8/12 of …", "answered 14 AI questions on Dutch Foundations", "drilled 40 words".
  - "Lesson N/M" is the person's current lesson (most recently moved unfinished, or next not started) over the course's published lessons.
  - Grouping is a pure, unit-tested function.
- [ ] Visibility:
  - Archived or draft courses the viewer cannot see are named as "a course".
  - A reset or deleted lesson removes its completion item.
  - Pages send `noindex`.
- [ ] API (auth and completed setup required):
  - `GET /api/people/:username` returns the header and course progress.
  - `GET /api/people/:username/activity?cursor=` returns grouped pages.
- [ ] Tests:
  - unit tests for grouping (repeats combined, another activity splits a group, day boundary, lesson N/M, AI-question counts);
  - Workers tests for signed-out and unfinished-setup refusal, reset removing an item, hidden courses anonymized, and no answers, results, scores, emails, or private learning data in responses;
  - RTL tests for the profile page, grouped items, and byline links;
  - Playwright: a completed lesson and answered AI questions appear grouped on the learner's profile, viewed by another signed-in account.
- [ ] Release: type-check, all suites, production builds, local migrations; roadmap status.
