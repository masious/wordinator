# AI tutor plan (C14)

Working plan for the AI tutor and the learning data it reads: word memory with full review history, stored practice attempts and pronunciation scores, the lesson progress tab with reset, the Weak words view, AI-generated practices, and the superuser analytics page. C14.0 moves every rule below into its owning document; after that this file holds delivery steps only and links to the owners. Phase status is mirrored in [docs/roadmap.md](docs/roadmap.md#course-phases).

Decisions agreed (2026-10-15):

- **Storage rule reversed.** Lesson practice answers and their check results, drill history, and pronunciation scores are now stored server-side for the tutor and the learner's own views. This reverses [courses.md](docs/courses.md#practice-answers), [words.md](docs/words.md#memory-leitner-boxes) ("only the latest state … never a history"), [words.md](docs/words.md#pronunciation-assessment) ("scores are never stored"), and [security and privacy](docs/security-and-privacy.md). Journal posts and comments are **not** sent to the AI for now (possible future addition).
- **Word memory replaces Leitner boxes.** C12 is unreleased, so Drill moves to the new model before release: an append-only review log plus a per-word memory row keyed by term key (not lesson word ID), using an FSRS-style model (stability, difficulty, recall probability now). Existing boxes seed it, then `course_word_drill_states` is dropped.
- **Weakness is visible.** A Weak words view on the Words tab lists words weakest first, each with 5 dots for its last 5 results. No percentages.
- **Lesson states per course:** not started, in progress (furthest share passed), completed, and **missed**. Missed is derived: an earlier lesson in a course with no completion or position while a later lesson has been started or completed. A course is complete when every published lesson is completed or missed. The tutor now and then mixes words from missed lessons into practice to gauge fluency.
- **Reset is permanent.** Resetting a lesson deletes its storyline position, completion, practice progress, practice attempts, and word reviews recorded from that lesson. Memory for the affected terms is then rebuilt from the reviews that remain, so a word learnt in another lesson stays known. Reset is available from the lesson progress tab, the lesson page (returns to the course's lesson list), and the tutor (with confirmation).
- **Lesson progress tab** on the single course page: each lesson's state, storyline progress, practices done, words reviewed, AI practices, and Reset.
- **Tutor entry point:** a `/ai` route, reached from a colourful CTA on `/courses`. No new navigation tab. Same features on mobile and desktop.
- **Conversations** are stored server-side, permanent, and archivable (never deleted).
- **Formatting:** user messages are plain text. Assistant messages may be split into several small sections (short headings) and support a small markdown subset (bold, italic, lists, inline code, safe `http`/`https` links), rendered without HTML.
- **Visible tool use:** every tool call shows in the chat as a step ("Looked up lesson 6", "Updated progress").
- **Confirmation:** tools that change progress or create content pause for an in-chat Confirm / Cancel card: finishing a lesson, resetting a lesson, and saving an AI practice. Reviews and attempts produced by the learner's own answers to interactive components are recorded without a prompt.
- **Interactive tools** render answer components in the chat. Chat answers count as practice attempts and word reviews. First set (C14i):
  - **Fill in the blank.**
  - **Translate into Dutch**, with a microphone that uses the existing recognizers and Azure pronunciation assessment.
  - **Word order**: shuffled chunks the learner clicks or drags into place.
  - **De or het**: a quick article picker for one or more nouns. Very common Dutch mistakes, graded instantly.
  - **Multiple choice**: one prompt and 3–4 options, for meaning, grammar, or the right form.
  - **Quick review**: drill-style cards (Show answer, Again / Got it) for a handful of words, writing word reviews like Drill.
  - **Say it**: the tutor's sentence is played (on-demand audio), and the learner repeats it for a pronunciation assessment (shadowing).
  - **Dictation**: audio only; the learner types what they heard, compared word by word.
  - **Fix the mistake**: a sentence with one error; the learner rewrites it and the tutor judges the fix.

  Later set (after C14j, if useful): verb conjugation grid (present, perfectum with *hebben*/*zijn*, imperfectum), matching pairs (term ↔ meaning), and role-play turns (the tutor plays a character from the course's dialogues; the learner answers by text or voice with optional hint chips).
- **Next lesson:** the tutor resolves the next lesson in the most recently active course, reads its content, can teach it in chat, and with confirmation marks lessons complete and advances progress.
- **AI-generated practices** are saved as reusable content tagged to one or more related lessons. Each tag stores an `afterId` (the block ID it follows). The lesson page has a button that expands the lesson's AI practices in place. Block IDs must stay stable across draft and publish (they already are UUIDs; C14.0 states this as a contract).
- **Providers:** Cloudflare Workers AI, OpenRouter, and Microsoft Azure (Foundry), switchable. Default order is OpenRouter free models → Workers AI → Azure, with automatic fallback on rate limit or error. No Anthropic/Claude agents.
- **On-demand audio:** Dutch text in assistant messages (marked by the model as target-language spans) gets a speaker button that generates speech on demand through the existing Azure voices and `speech_clips` cache. This reverses the [security and privacy](docs/security-and-privacy.md) rule that no route accepts arbitrary text. Only text from the user's own assistant messages can be spoken, never text the user typed.
- **Usage:** a per-user daily cap of 40 tutor turns (UTC day), adjustable by the superuser. Token usage is recorded per request.
- **Superuser:** a new `users.is_superuser` flag, set by an explicit-target command. The analytics page (superuser only) shows active users, lessons completed, drill and practice volume, and AI messages, tokens, and cost per user and provider, and speech generation requests and characters per user. It also holds the AI settings (provider order, models, cap). Group removal stays separate tech debt.

To confirm during C14.0 (assumptions taken so far):

- AI practices are visible to everyone who can read the lesson, and the course owner and contributors can remove them.
- The Drill's Weak words source switches from bookmarks to `word_memory` (weakest recall first, bookmarks as a tiebreak).
- Native language and reply language are set in Settings (a new Tutor section), and the tutor may rewrite its own `tutor_notes`.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## C14.0 — Docs and decisions

- [ ] New owner [docs/ai-tutor.md](docs/ai-tutor.md): entry point, conversations and archiving, formatting, tools and their visibility, confirmation, interactive components, next lesson, providers and fallback, the daily cap, and prompt-injection rules. Add it to [docs/index.md](docs/index.md).
- [ ] [docs/speech.md](docs/speech.md): on-demand clips for assistant messages, their voice, caching, and metering.
- [ ] [docs/words.md](docs/words.md): word memory (replacing Leitner boxes), the review log, the Weak words view, Drill ordering from memory, stored pronunciation scores.
- [ ] [docs/courses.md](docs/courses.md): stored practice attempts, lesson states including missed, course completion, the lesson progress tab, reset, AI practices on the lesson page, and block ID stability.
- [ ] [docs/data-model.md](docs/data-model.md): every table under C14a, C14e, C14f, and C14h; drop `course_word_drill_states`.
- [ ] [docs/security-and-privacy.md](docs/security-and-privacy.md): on-demand speech of assistant text (and its quota guard), what is stored, what is sent to each provider (lesson content, the learner's words, attempts, memory, profile; never posts, comments, credentials, or other users' data), OpenRouter free models possibly logging prompts, and the accepted trade-off.
- [ ] [docs/settings-and-administration.md](docs/settings-and-administration.md): the superuser flag, analytics, AI settings, and the Tutor settings section.
- [ ] [docs/architecture.md](docs/architecture.md), [docs/operations.md](docs/operations.md) (secrets, the Workers AI binding, the superuser command), [docs/design-system.md](docs/design-system.md) (CTA, chat surfaces, tool steps, answer components, dots), [docs/testing.md](docs/testing.md), [docs/user-flows.md](docs/user-flows.md), [docs/what_is_it.md](docs/what_is_it.md) (the no-scores non-goal narrows), and [docs/roadmap.md](docs/roadmap.md) (C14).
- [ ] Mark `CLAUDE.md` product invariants that change: rich text stays limited to lessons, plus the assistant's markdown subset.

## C14a — Learning data foundation

- [ ] Migration and schema:
  - `word_reviews`: id, user_id, term_key, course_id, lesson_id, word_id, direction, result (`got` | `again`), source (`drill` | `ai_chat` | `ai_practice` | `seed`), conversation_id, created_at. Indexed by `(user_id, term_key, direction, created_at)` and `(user_id, lesson_id)`.
  - `word_memory`: primary key `(user_id, term_key, direction)`; the representative lesson and word ID, `recent` (last 10 results as a bit string), reps, lapses, last_lapse_at, stability, difficulty, last_reviewed_at, known_override.
  - `practice_attempts`: id, user_id, course_id, lesson_id (nullable), practice_kind (`lesson` | `ai`), practice_id, item_index, prompt, answer, reference, matched (nullable), ai_verdict (`acceptable` | `error`, nullable), ai_note, source (`lesson` | `ai_chat` | `ai_practice`), conversation_id, created_at.
  - `pronunciation_attempts`: id, user_id, surface (`drill` | `word_card` | `ai_chat`), reference_text, term_key, lesson_id, word_id, overall, accuracy, fluency, completeness, word_scores JSON, created_at.
  - `progress_events` (audit only, no undo): id, user_id, actor (`user` | `agent`), kind, course_id, lesson_id, conversation_id, created_at.
  - None of the new tables has `group_id`, per [storage compatibility](docs/groups-and-membership.md#storage-compatibility).
- [ ] Pure memory engine (in the API, beside `wordDrill.ts`): fold one review into a memory row, rebuild a row from its reviews, recall probability at a time. Evaluate `ts-fsrs` against a small in-house version; the decision goes in the notes.
- [ ] Seed migration: one `seed` review per existing drill state, memory rows from the boxes, then drop `course_word_drill_states`.
- [ ] Drill: grading writes a review and updates memory in one batch; the deck builder ranks by recall probability instead of box tiers.
- [ ] Lesson deletion removes the new rows explicitly in its batch.
- [ ] Tests: engine unit tests (fold, rebuild equals incremental, recall decay); Workers tests for grade → review + memory, seeding, another account's rows never read, deck order from memory.

## C14b — Capturing attempts and pronunciation

- [ ] Contracts and API: `POST .../practice-attempts` (one checked item; the server re-derives `matched` from the published author's version and never trusts the client's), and `POST .../pronunciation-attempts`.
- [ ] Web: the lesson Answer dialog, Practice again, and the player record an attempt on each answer check; drill cards and Words tab word cards record Microsoft assessments. Local drafts stay as they are.
- [ ] Tests: validation, ownership, visibility, matched re-derived; RTL that a check posts once and a failed post does not block the learner.

## C14c — Lesson progress tab and reset

- [ ] API: a course progress read with derived lesson states (including missed), storyline share, practices done of total, words reviewed of total, AI practice count, and course completion. Add `POST .../lessons/:lessonId/reset`, which deletes in one batch, rebuilds affected memory rows, and writes a `progress_events` row.
- [ ] Web: the Progress tab on the single course page with a confirm dialog for Reset. The lesson page gets a Reset button that confirms and returns to the course's lesson list.
- [ ] Tests: the missed derivation, completion with missed lessons, reset scope (other lessons' reviews of a shared term survive), negative authorization; RTL for both reset entry points.

## C14d — Weak words view

- [ ] API: a cursor-paginated weak words read from `word_memory`, ordered by recall probability now, each with its last 5 results and lesson context.
- [ ] Web: a Weak words view on the Words tab with 5 dots per word (got, again, empty), and Drill from this list.
- [ ] Tests: ordering with time decay, known_override excluded; RTL for the dots and empty state.

## C14e — Superuser and analytics

- [ ] Migration: `users.is_superuser` (default false). A `pnpm` script grants and revokes by email and requires `--local` or `--remote`.
- [ ] API: superuser-only analytics reads (active users, lessons completed, drill reviews, practice attempts, AI usage per user and provider by day, and speech requests and characters per user by day). AI settings are stored in `platform_metadata` under `ai_settings` (provider order, model per provider, daily cap) with a contracts schema.
- [ ] Web: an `/admin/analytics` route linked from Settings for superusers only, with an AI settings form.
- [ ] Tests: `403` for non-superusers on every route; settings validation; RTL for the page and the hidden link.

## C14f — Provider layer and metering

- [ ] One OpenAI-compatible chat-completions client with three configured targets: OpenRouter, Workers AI's OpenAI-compatible endpoint (via the `ai` binding), and Azure Foundry. Verify each target's tool-calling and streaming format with current docs before building.
- [ ] Fallback through the configured order on 429, 5xx, or timeout. Only tool-calling models are allowed.
- [ ] `ai_usage`: id, user_id, conversation_id, provider, model, tokens_in, tokens_out, cost_microusd, ok, created_at. Enforce the daily turn cap before the first model call.
- [ ] `speech_usage`: id, user_id, surface (`ai_message`; later others), clip_hash, characters, cached (a cache hit costs nothing at Azure), created_at. A daily per-user character cap in `ai_settings`.
- [ ] Secrets (`OPENROUTER_API_KEY`, `AZURE_AI_ENDPOINT`, `AZURE_AI_KEY`) are Worker secrets. Never log prompts, answers, or keys.
- [ ] Tests: fallback order, cap refusal (`429 AI_DAILY_LIMIT`), usage recorded on success and failure, against a stubbed fetch; speech usage recorded for misses and cache hits.

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
