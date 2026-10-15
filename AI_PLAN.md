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

Details C14.0 settled that were not in the agreed list (review before C14a):

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

## C14b — Capturing attempts and pronunciation

- [ ] Contracts and API: `POST .../practice-attempts` (one checked item; the server re-derives `matched` from the published author's version and never trusts the client's), and `POST .../pronunciation-attempts`.
- [ ] Web: the lesson Answer dialog, Practice again, and the player record an attempt on each answer check; drill cards and Words tab word cards record Microsoft assessments. Local drafts stay as they are.
- [ ] Tests: validation, ownership, visibility, matched re-derived; RTL that a check posts once and a failed post does not block the learner.

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

## C14e — Superuser and analytics

- [ ] Migration: `users.is_superuser` (default false). A `pnpm` script grants and revokes by email and requires `--local` or `--remote`.
- [ ] API: superuser-only analytics reads (active users, lessons completed, drill reviews, practice attempts, AI usage per user and provider by day, and speech requests and characters per user by day). AI settings are stored in `platform_metadata` under `ai_settings` (provider order, model per provider, daily cap) with a contracts schema.
- [ ] Web: an `/admin/analytics` route linked from Settings for superusers only, with an AI settings form.
- [ ] Tests: `403` for non-superusers on every route; settings validation; RTL for the page and the hidden link.

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

## C14g — Tutor API

- [ ] Tables:
  - `ai_conversations`: id, user_id, title, archived_at, created_at, updated_at.
  - `ai_messages`: id, conversation_id, user_id, role, parts JSON (`text`, `tool_call`, `tool_result`, `component`, `confirmation`), status (`complete` | `awaiting_user` | `error`), provider, model, created_at. Cursor-paginated by `(conversation_id, created_at, id)`.
  - `learner_profiles`: user_id, native_language, reply_language, goals, tutor_notes, updated_at.
- [ ] Routes: list, create, archive, and unarchive conversations; read messages; `POST .../messages` streams the turn over SSE (text deltas, tool steps, components, confirmations); `POST .../tool-calls/:id/respond` answers a component or a confirmation and resumes the loop.
- [ ] Agent loop: a compact learner snapshot (profile, recent lessons, in-progress lessons, weakest words, recent misses) in the system prompt; everything else through tools, each scoped to the signed-in account and the lessons it can read:
  - Read tools: `search_words`, `get_weak_words`, `get_recent_words`, `get_course_progress`, `get_lesson` (by ID or `next`), `get_recent_mistakes`, `list_ai_practices`.
  - Interactive tools: `ask_fill_in`, `ask_translate`, `ask_word_order`, `ask_article`, `ask_choice`, `ask_quick_review`, `ask_say_it`, `ask_dictation`, `ask_fix_mistake`. Each component's payload and answer have a contracts schema. Deterministic kinds (fill in, word order, article, choice, dictation) are graded by the server. Open kinds (translate, fix the mistake) compare with the reference and then take the model's verdict into `ai_verdict`. The server grades each answer, writes attempts and reviews, and returns the result to the model.
  - Confirmed writes: `complete_lesson`, `reset_lesson`, `save_ai_practice`.
  - Unconfirmed writes: `record_word_review` (only for answers given in this conversation), `update_tutor_notes`.
- [ ] `POST .../messages/:messageId/speech` with `{ spanIndex }`: resolves the span from the stored assistant message (never from client text), synthesizes it through the existing speech pipeline synchronously or returns the cached clip, records `speech_usage`, and enforces the character cap (`429 SPEECH_DAILY_LIMIT`).
- [ ] Prompt injection: lesson text and tool results go to the model as quoted data; every progress or content change needs the user's confirmation; tools never accept another user's ID.
- [ ] Tests: auth and ownership on every route; tools never reach another account or an invisible lesson; a confirmation is required before a write; a component answer writes an attempt; archive is permanent and reversible; streamed events against a stubbed provider.

## C14h — AI-generated practices

- [ ] Tables: `ai_practices` (id, kind `fill_in` | `translate` | `word_order` | `article` | `choice` | `dictation` | `fix_mistake`, payload JSON per contracts, created_by_user_id, conversation_id, created_at) and `ai_practice_lessons` (practice_id, lesson_id, course_id, after_block_id, position; primary key `(practice_id, lesson_id)`).
- [ ] `save_ai_practice` validates that every `after_block_id` exists in the lesson's published document. A missing anchor at read time places the practice at the end of the lesson.
- [ ] Lesson read includes the AI practice count. A separate read returns the practices with their anchors. Owners and contributors can remove a tag.
- [ ] Web: a Show AI practices (n) button on the lesson page that expands each practice after its anchor block, answered with the same components and recorded as `ai_practice` attempts.
- [ ] Tests: anchor validation, multi-lesson tags, removal permissions, visibility; RTL for the expander and placement.

## C14i — Tutor web

- [ ] A colourful CTA on `/courses`, and a `/ai` route with a conversation list (active and archived) and the chat. Responsive, so mobile has every feature.
- [ ] Message rendering: plain text for the user; a safe markdown-subset renderer for the assistant with small sections (no raw HTML, only `http`/`https` links). Target-language spans get a speaker button that requests on-demand speech and plays through the shared `Speech` element.
- [ ] Tool steps as compact chips with an expandable detail; Confirm / Cancel cards.
- [ ] Answer components:
  - Fill in the blank.
  - Translate into Dutch with a microphone through `useSpokenAnswer`, with the answer window extended for sentences (the current `MAX_ANSWER_MS` targets single terms).
  - Word order with click-to-place and drag, keyboard accessible.
  - De or het (two large toggle buttons per noun), Multiple choice (keyboard 1–4), Quick review (reusing the drill card), Say it and Dictation (on-demand audio plus the recognizer or a text field), Fix the mistake (a pre-filled editable sentence).
- [ ] Settings: a Tutor section (native language, reply language, goals). The daily-limit state is shown in the composer.
- [ ] All copy goes behind i18next keys; tokens only, no raw values.
- [ ] Tests: RTL for streaming render, sections, on-demand speech (loading, cached, limit), chips, confirmation, each component, archive, limit state.

## C14j — Critical paths and release

- [ ] Playwright with a stubbed provider: ask for the next lesson → steps visible → a fill-in answered → confirm complete → the Progress tab shows it; reset from the lesson page; the Weak words dots; superuser analytics hidden from others.
- [ ] Type-check, Vitest, Workers, RTL, Playwright, and production builds for web and API. Apply migrations to local, then production with the explicit target.
- [ ] Release notes and roadmap status.

## C14k — Profile activity

Requested 2026-10-16. **Secondary priority:** it runs last, after C14j, and has its own tests and release step. It needs C14c (`progress_events`, lesson states), C14g (tutor completions), and C14h (AI practices).

Decided 2026-10-16:
- Each user's page shows their activities, and these are **publicly available**: signed-out visitors can read profiles and activity too.
- The page shows the person's progress in every course they have started.
- Small activities are reported, and repeats are combined, e.g. "Masoud completed 3 lessons and is on lesson 8/12 of Dutch Foundations".
- Activity types:
  - lesson completed (marked "with the tutor" when the tutor recorded it);
  - course progress and course completed;
  - answering AI-generated questions, both tutor components and AI practices on lesson pages (counts only, never the questions or answers);
  - drill sessions.

**Conflicts to reconcile in the first step.** Each one reverses a recorded decision:
- [profile pages are retired](docs/profiles-and-settings.md#profile-pages-retired);
- "public profiles" is a [non-goal](docs/what_is_it.md#explicit-non-goals);
- C14.0 made progress [private to the learner](docs/security-and-privacy.md#account-and-profile-privacy);
- the [security baseline](docs/security-and-privacy.md) assumes every read is signed in.

**Still to confirm:**
- Whether a Settings switch lets a person hide their activity. Assumed: yes, on by default.
- Whether profiles are indexable by search engines. Assumed: no, `noindex`.
- A lesson reset removes that lesson's completion from the activity.
- Answers, mistakes, weak words, scores, and conversations are never shown.

- [ ] Docs and decisions:
  - A new owner `docs/profiles-and-activity.md` covering the public profile route, activity types, grouping, visibility, the opt-out, reset, and what is never shown.
  - Reverse the conflicting rules above in [what_is_it.md](docs/what_is_it.md), [security-and-privacy.md](docs/security-and-privacy.md) (public read surface, signed-out access, scraping), [courses.md](docs/courses.md#progress), [words.md](docs/words.md#word-memory), and [profiles-and-settings.md](docs/profiles-and-settings.md).
  - Update [data-model.md](docs/data-model.md), [architecture.md](docs/architecture.md) (an unauthenticated route), [design-system.md](docs/design-system.md), [user-flows.md](docs/user-flows.md), [testing.md](docs/testing.md), and [roadmap.md](docs/roadmap.md).
- [ ] Profile page:
  - `/people/:username`, readable signed out.
  - Bylines (posts, comments, contributors, editor attribution) link to it.
  - The header shows the avatar, display name, `@username`, and bio. Email and quick reactions stay hidden.
  - A Courses section shows progress in each course started (percentage and "lesson N/M").
  - An Activity list, newest first, in cursor pages.
- [ ] Activities are derived at read time from `progress_events`, lesson completions, positions, `practice_attempts` (sources `ai_chat` and `ai_practice`), and drill reviews, plus a new `progress_events` kind `course_completed` written when the last lesson completes. Activity reads never return answer text.
- [ ] Grouping:
  - Consecutive activities of the same kind in the same course, with no other activity between them and within a UTC day, combine into one item.
  - Examples: "completed 3 lessons and is on lesson 8/12 of …", "answered 14 AI questions on Dutch Foundations", "drilled 40 words".
  - "Lesson N/M" is the person's current lesson (most recently moved unfinished, or next not started) over the course's published lessons.
  - Grouping is a pure, unit-tested function.
- [ ] Visibility:
  - Archived or draft courses the viewer cannot see are named as "a course".
  - A reset or deleted lesson removes its completion item.
  - The opt-out hides the Courses and Activity sections.
  - Pages send `noindex`.
  - The public routes are rate limited or cached so they are cheap to scrape.
- [ ] API (no auth required for the reads):
  - `GET /api/people/:username` returns the header and course progress.
  - `GET /api/people/:username/activity?cursor=` returns grouped pages.
  - The settings read and update add `showActivity`.
- [ ] Tests:
  - unit tests for grouping (repeats combined, another activity splits a group, day boundary, lesson N/M, AI-question counts);
  - Workers tests for signed-out reads, the opt-out, reset removing an item, hidden courses anonymized, and no answers, emails, or private learning data in responses;
  - RTL tests for the profile page, grouped items, byline links, and the Settings switch;
  - Playwright: a completed lesson and answered AI questions appear grouped on the learner's profile, viewed signed out.
- [ ] Release: type-check, all suites, production builds, local migrations; roadmap status.

