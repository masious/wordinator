# AI tutor

Status: approved product change (C14, 2026-10-15), planned. C14.0 (docs and decisions) is complete; the delivery steps are in [AI_PLAN.md](../AI_PLAN.md) and the phases in the [roadmap](roadmap.md#course-phases).

The tutor is a chat assistant that teaches from the library's lessons and the learner's own learning data. It can find the learner's next lesson and teach it, ask practice questions through answer components in the chat, record what the learner got right and wrong, and, with the learner's confirmation, finish or reset lessons and save practices for other learners. This document owns the tutor: its entry point, conversations, formatting, tools, confirmation, components, providers, and limits. The learning data it reads and writes is owned elsewhere: [word memory](words.md#word-memory) and [stored pronunciation scores](words.md#pronunciation-assessment) by words, [practice attempts](courses.md#practice-attempts), [lesson states](courses.md#lesson-states), [reset](courses.md#reset), and [AI practices](courses.md#ai-practices) by courses, and [on-demand audio](speech.md#on-demand-audio) by speech.

## Entry point

- The tutor lives at `/ai`. It has no navigation tab: a colourful call to action at the top of `/courses` (Ask your tutor) opens it.
- The tutor is the one exception to [desktop first](what_is_it.md#desktop-first) (approved product change, 2026-10-15): `/ai` and every tutor component work the same on phones and desktops. The page shows the conversation list beside the chat on wide screens and as a separate view on narrow ones.
- Every signed-in account that has completed setup can use it. There is no per-user opt-in; the page says plainly, above the first message of a new conversation, that conversations are processed by external AI providers that may keep them (see [security and privacy](security-and-privacy.md#ai-tutor)), and nothing is sent until the learner writes.

## Conversations

- A conversation belongs to one account and is never shown to anyone else.
- The conversation list shows active conversations, most recently updated first, with an Archived view. New conversation starts an empty one; its title is the first user message, cut to 80 characters.
- Conversations are stored permanently. **Archive** moves one to the Archived view and **Unarchive** brings it back; there is no delete. An archived conversation can be read but not continued until it is unarchived.
- Messages load newest page first and older pages on scroll, by cursor.
- A turn that fails partway (a provider error after fallback, or a refused tool) ends with an error part and a Try again action that resends the last user message. Tool results already written stay written.

## Messages and formatting

- **User messages** are plain text, at most 4,000 characters, shown with line breaks preserved and only safe `http`/`https` URLs linked, like journal posts.
- **Assistant messages** are a sequence of parts: text, tool steps, components, and confirmation cards. Text parts may use a small Markdown subset: **bold**, *italic*, bulleted and numbered lists (one level), inline code, short headings (one level, rendered as section labels), and `http`/`https` links. A long answer is split into several small sections under those headings. Anything else (raw HTML, images, tables, code blocks, other link schemes) is shown as its literal text. The renderer is Wordinator's own and never injects HTML.
- **Target-language spans.** The model marks Dutch or German text it wants spoken. Each marked span renders as normal text with a speaker button that requests [on-demand audio](speech.md#on-demand-audio). The marking is stored with the message; the web cannot add spans.
- Assistant text streams in as it is generated. A stopped stream keeps what arrived.
- This subset is the only rich text outside course lessons; see [product requirements](product-requirements.md#global-content-rules).

## Learner context

Each turn starts with a compact snapshot of the learner in the system prompt: their [tutor profile](#tutor-profile), the lessons they recently studied, lessons in progress, their weakest words from [word memory](words.md#word-memory), and their most recent practice misses. Everything else is fetched through tools.

The tutor never sees journal posts, comments, reactions, notifications, other learners' data, email, or credentials. Sending journal content to the tutor is a possible later addition and needs its own product decision. What each provider receives is listed in [security and privacy](security-and-privacy.md#ai-tutor).

## Tools

Every tool runs in the API as the signed-in account, under the same visibility rules as the matching read: lessons the learner cannot read are invisible, and no tool takes a user ID.

- **Read tools:** `search_words`, `get_weak_words`, `get_recent_words`, `get_course_progress`, `get_lesson` (by ID, or `next`), `get_recent_mistakes`, and `list_ai_practices`.
- **Interactive tools** show an [answer component](#answer-components) and wait for the learner's answer.
- **Writes that need confirmation:** `complete_lesson`, `reset_lesson`, and `save_ai_practice`.
- **Writes without confirmation:** `record_word_review`, only for a word the learner answered in this conversation, and `update_tutor_notes`, the tutor's own notes about the learner.

**Visible steps.** Every tool call shows in the chat as a compact step chip in plain words (Looked up lesson 6, Checked your weak words, Updated progress), with an expandable detail of what was read or changed. A failed tool shows as a failed step. Steps are stored with the message.

## Confirmation

Tools that change progress or create content stop the turn and show a confirmation card in the chat: what will happen, in plain words, with **Confirm** and **Cancel**.

- Confirmed writes are finishing a lesson, [resetting a lesson](courses.md#reset) (the card names everything that will be deleted), and [saving an AI practice](courses.md#ai-practices).
- Confirm runs the write and resumes the turn; Cancel resumes it with the refusal, and the tutor carries on without the change. A card left unanswered stays open; it is answered at most once.
- Reviews and attempts that come from the learner's own answers to components are recorded without a card. Writing them is what answering means.
- Every progress change the tutor makes writes a `progress_events` audit row with actor `agent` (see [data model](data-model.md#progress_events)). There is no undo; a reset is reversed only by studying again.

## Answer components

Interactive tools render answer components in the chat. Each component's payload and its answer have a contracts schema, and the server grades every answer, so the model never decides a deterministic result.

| Component | What the learner does | Graded by |
| --- | --- | --- |
| Fill in the blank | types the missing word or words into each blank | server, with the shared answer matching |
| Translate into Dutch | types or says a translation of an English sentence | server comparison with the reference, then the model's verdict |
| Word order | puts shuffled chunks in order by clicking or dragging (keyboard accessible) | server |
| De or het | picks the article for one or more nouns with two large toggle buttons each | server |
| Multiple choice | picks one of 3–4 options for meaning, grammar, or form (keys `1`–`4`) | server |
| Quick review | drill-style cards for a handful of words: Show answer, then Again or Got it | self-graded, like [Drill](words.md#drill) |
| Say it | hears the tutor's sentence and repeats it | Microsoft [pronunciation assessment](words.md#pronunciation-assessment) |
| Dictation | hears audio only and types what they heard | server, word by word |
| Fix the mistake | rewrites a sentence that has one error | server comparison with the reference, then the model's verdict |

- **Deterministic kinds** (fill in, word order, de or het, multiple choice, dictation) are graded by the server alone, with `answerMatches` and `normalizeAnswer` from the contracts where text is compared.
- **Open kinds** (translate, fix the mistake) are first compared with the reference. A match is accepted at once; otherwise the model judges the answer as `acceptable` or `error` with a short note, since a sentence can be right in several ways. The verdict and note are stored on the [attempt](courses.md#practice-attempts).
- **Recording.** Each graded answer writes a practice attempt with source `ai_chat` and, for every lesson word it tests, a [word review](words.md#word-memory) with source `ai_chat`. Say it writes a [pronunciation attempt](words.md#pronunciation-assessment). The grade then goes back to the model so it can continue.
- **Speech.** Translate into Dutch has a microphone that uses the learner's chosen [recognizer](words.md#recognizers), with a longer answer window for sentences. Say it and Dictation play their sentence through [on-demand audio](speech.md#on-demand-audio). Say it needs the Microsoft recognizer; with the browser recognizer it says so and offers Translate instead.
- A component is answered once. After answering it shows the result in place (the same verdict badge as drill cards: Matches!, Not quite, or the tutor's note) and no longer accepts input.
- Missed lessons: now and then the tutor mixes words from [missed lessons](courses.md#lesson-states) into a component to gauge whether the learner already knows them.

Later, if useful after release: a verb conjugation grid (present, perfectum with *hebben* or *zijn*, imperfectum), matching pairs (term and meaning), and role-play turns where the tutor plays a character from the course's dialogues and the learner answers by text or voice with optional hint chips.

## Next lesson

Asked what to study, the tutor calls `get_lesson` with `next`: the next lesson in the course the learner was most recently active in, chosen like the course page's [progress card](courses.md#lesson-player) (the most recently moved unfinished lesson, otherwise the first one not started or completed). It reads the published document and can teach it in the chat: explain its grammar, introduce its words, read its dialogue, and ask questions about it with components. When the learner is done, the tutor offers to mark the lesson complete through a confirmation card; confirming records the completion exactly as finishing the lesson does.

## Tutor profile

Settings has a Tutor section ([settings and administration](settings-and-administration.md#tutor-settings)) with:

- **Native language** (default English): the language the tutor explains in when the learner has not said otherwise.
- **Reply language** (the native language, the library language, or mixed): how much of its own text the tutor writes in the target language.
- **Goals**: optional plain text, at most 500 characters, for what the learner wants to work on.

The tutor keeps its own **tutor notes** about the learner (plain text, at most 2,000 characters) through `update_tutor_notes`, for example recurring mistakes. The learner can read and clear them in the Tutor section. They are part of the snapshot.

## Providers and fallback

- The API calls models through one OpenAI-compatible chat-completions client with three configured targets: **OpenRouter**, **Cloudflare Workers AI** (its OpenAI-compatible endpoint through the `AI` binding), and **Microsoft Azure AI Foundry**. Anthropic models and agents are not used.
- The default order is OpenRouter free models, then Workers AI, then Azure. A `429`, a `5xx`, a refused key (`401`/`403`), a network failure, or a timeout moves the turn to the next target, as long as that target has not streamed any text yet; an invalid request does not, and neither does a failure after text has been streamed. A target turned off, or without its key or binding, is skipped. Only models that support tool calling may be configured.
- The superuser sets the order and the model per target in the [AI settings](settings-and-administration.md#ai-settings). Each assistant message stores the provider and model that wrote it.
- OpenRouter's free models may log prompts at the model host; see [security and privacy](security-and-privacy.md#ai-tutor).

## Usage and limits

- **Daily turns.** Each account has at most 40 tutor turns per UTC day (one user message or one component or confirmation answer that resumes the model counts as a turn). The superuser can change the cap. The API checks it before the first model call and refuses with `429 AI_DAILY_LIMIT` and `resetsAt` (the next UTC midnight); the composer then says when the limit resets and stays disabled until then. A turn is counted by the `ai_usage` row of its first model request (marked as a turn start), whether or not the request succeeded; fallback attempts and the further model calls of the turn's tool loop are not counted again, and a turn that reached no provider is not counted.
- **Speech.** On-demand audio has its own daily character cap per account; see [on-demand audio](speech.md#on-demand-audio).
- **Metering.** Every model request writes an `ai_usage` row (provider, model, tokens in and out, cost, success), and every on-demand speech request a `speech_usage` row. The superuser sees both on the [analytics page](settings-and-administration.md#analytics).

## Prompt injection and scope

- Lesson text, words, the learner's answers, and tool results reach the model as quoted data in tool results, never as instructions.
- Tools take only IDs of things the account can read and never another user's ID; the API scopes every call to the signed-in account regardless of what the model asks for.
- Every change to progress or shared content goes through a [confirmation](#confirmation) card that the learner answers in the web, so text in a lesson cannot finish, reset, or publish anything on its own.
- `record_word_review` accepts only words that a component in the same conversation tested, so the model cannot write reviews for arbitrary words.
- On-demand speech reads text only from stored assistant messages, never from the request.

## API

Routes sit under `/api/ai/...`, after authentication and completed setup. Every conversation, message, and tool call ID is resolved under the signed-in account; another account's IDs return `404`.

- `GET /api/ai/conversations?archived=&cursor=` lists conversations; `POST /api/ai/conversations` creates one; `POST .../conversations/:id/archive` and `.../unarchive` move it.
- `GET .../conversations/:id/messages?cursor=` reads messages newest first, by `(created_at, id)` cursor.
- `POST .../conversations/:id/messages` with `{ text }` starts a turn and streams it as server-sent events: text deltas, tool steps, components, confirmation cards, an error, and the end. `429 AI_DAILY_LIMIT` at the cap, `409 CONVERSATION_ARCHIVED` for an archived conversation, and `409 TURN_IN_PROGRESS` while a component or confirmation waits.
- `POST .../tool-calls/:toolCallId/respond` answers a component or a confirmation and streams the resumed turn. A second answer is `409 TOOL_CALL_ANSWERED`.
- `POST .../messages/:messageId/speech` with `{ spanIndex }` returns the span's clip; see [on-demand audio](speech.md#on-demand-audio).
- `GET` and `PUT /api/ai/profile` read and update the [tutor profile](#tutor-profile); `DELETE /api/ai/profile/notes` clears the tutor notes.

Data lives in [`ai_conversations`](data-model.md#ai_conversations), [`ai_messages`](data-model.md#ai_messages), [`learner_profiles`](data-model.md#learner_profiles), and [`ai_usage`](data-model.md#ai_usage), with the learning tables listed under [learning data](data-model.md#learning-data).

## Not in scope

- Journal posts and comments as tutor context.
- Voice conversation (speaking whole turns to the tutor); only components listen.
- Sharing conversations, or showing them to course owners or the superuser. The superuser sees counts and costs, never messages.
- Ranking, streaks, or scores. The tutor's feedback stays personal, like the rest of Wordinator.
