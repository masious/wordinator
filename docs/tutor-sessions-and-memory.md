# Tutor sessions and memory

Status: approved product change (C14l, 2026-10-16), planned. It builds on the [AI tutor](ai-tutor.md) (C14) and is delivered after C14j; the steps are in [AI_PLAN.md](../AI_PLAN.md#c14l--tutor-sessions-and-memory) and the phase in the [roadmap](roadmap.md#course-phases).

The tutor remembers what a learner studied and when, plans study sessions, teaches words that are not in any lesson, and makes practices just for one learner. This document owns study plans and the session panel, the per-conversation context scope, dated tutor notes, practice topics, tutor words, word observations, personal practices, the reading component, and short references in the prompt. The tutor's chat, tools, components, and limits stay with [ai-tutor.md](ai-tutor.md); word memory and the Words tab with [words](words.md); the lesson page with [courses](courses.md).

Everything here is private learning data: it belongs to one account, is read only by that learner and their tutor, and is never shown on profiles, in the journal, or to course owners. The superuser's [analytics](settings-and-administration.md#analytics) may count it per account, never its text.

## Study plans

A learner can ask for a session ("15 minutes on what I'm weak at") and the tutor proposes a plan, then works through it. The plan is dynamic: the tutor chooses which steps to include and may change the steps it has not started.

- **Starting.** `start_plan` (no confirmation) takes a title (at most 80 characters), an optional target length in minutes (5–90), and 1–8 steps. A step has a kind (`vocabulary`, `speaking`, `grammar`, `exercises`, `reading`, `review`, `summary`, or `other`), a label (at most 80 characters), an optional [topic](#practice-topics), optional lesson references (at most three), and an estimated length in minutes (1–30). The plan shows in the chat as a **plan part**: a dated card listing the steps.
- **One active plan per conversation.** Starting a new plan ends the active one as `ended`. A conversation can hold any number of plans over time.
- **Progress.** `update_plan` marks a step `active`, `done`, or `skipped`, and may replace the steps that are still pending (the done and skipped ones stay). Steps are never reopened. The web never marks steps; only the tutor does, and every change shows as a [tool step](ai-tutor.md#tools) chip.
- **Finishing.** `finish_plan` takes a summary (plain text with the assistant Markdown subset, at most 1,500 characters) and ends the plan as `completed`. A plan left active for 24 hours is read as `ended`. The summary is kept on the plan and shown in the [session panel](#session-panel).
- **Results without the scrollback.** `get_plan_results` returns, for a plan of this conversation, every component answered since the plan started (kind, topic, prompt, the learner's answer, the reference, the grade or verdict), the words reviewed with their results, and the tutor words added. The tutor uses it for the closing summary and its review of mistakes, so a long session does not depend on the 40 stored messages the model sees each turn.
- **Pacing.** There is no timer. Step lengths are the tutor's estimates. The snapshot gives the tutor the current time, the active plan's start, and the learner's turns left today (see [usage and limits](ai-tutor.md#usage-and-limits)), and the tutor sizes plans to the turns left: one answered component is one turn.
- **Not a score.** A plan has no grade or percentage. The panel counts what happened (steps done, questions answered, words reviewed), never how many were right.

## Session panel

The `/ai` chat shows a **Session** panel: on wide screens a collapsible card at the top of the chat column, on phones a collapsed bar under the chat header that opens as a sheet.

- **This session.** The conversation's active plan (or its latest one): title, date, time since it started, its steps with their status and estimated minutes, and counts of questions answered, words reviewed, and tutor words added since it started. A completed plan shows its summary.
- **Earlier sessions.** The learner's previous plans across all conversations, newest first, in cursor pages of ten: date, title, steps done of total, the same counts, and a link to the conversation (an archived conversation opens read-only).
- With no plan yet, the panel offers **Plan a session**, which sends a fixed request to the tutor ("Plan a study session for me") as the learner's message.
- Counts are derived at read time from the plan's conversation and time window (`practice_attempts`, `word_reviews`, `tutor_words` with that conversation ID, from the plan's start to its end); no counter is stored.

## Context scope

The [learner snapshot](ai-tutor.md#learner-context) is the context the tutor starts each turn with. The learner chooses how much of it each conversation gets.

- **Sections and sizes.** Each section can be off or sized: tutor notes (0–20 entries, default 10), due follow-ups (0–10, default 5), recently completed lessons (0–10, default 5), lessons in progress (0–10, default 5), weakest words (0–40, default 15), recent words (0–40, default 0), recent mistakes (0–20, default 5), recent topics (0–20, default 8), tutor words (0–40, default 10, weakest first), and earlier plans (0–5, default 3, title, date, and summary). The profile, goals, the current time, the turns left, and the active plan are always included.
- **Course focus.** Optionally one course: the lesson, word, mistake, and topic sections then draw only from that course (tutor words tagged to its lessons count as in it).
- **Per conversation.** A new conversation starts from the learner's defaults. Before the first message a **Context** control above the composer shows the scope as a short summary and opens a dialog to change it; the chat header keeps the control afterwards, and a change applies from the next turn. Defaults are edited in the [Tutor settings](settings-and-administration.md#tutor-settings) section.
- **Not a boundary.** The scope shapes only the snapshot. The tutor can still fetch anything the learner can read through its [tools](ai-tutor.md#tools), and switching a section off does not hide data from it.
- Larger scopes cost more tokens per turn; the dialog says so in one line. A section costs roughly 10–15 tokens per word or lesson with [short references](#short-references).

## Tutor notes

Tutor notes are a list of short, dated entries, replacing C14's single notes text.

- **Entry.** Plain text of at most 300 characters, an optional [topic](#practice-topics), an optional **follow-up date** (the day the tutor means to come back to it, for example "check the five time-of-day words"), the conversation it was written in, and created and updated dates. At most 50 entries per account.
- **Tools** (no confirmation): `add_note`, `edit_note` (text, topic, or follow-up), and `remove_note`. At 50 entries `add_note` fails with `NOTES_FULL`, and the tutor removes or merges an old one first.
- **What the tutor notes.** Recurring mistakes, preferences ("likes dialogues", "explain grammar in Persian"), what it introduced and when, and what it plans to revisit. It does not note what the data already records (individual answers, scores, words reviewed).
- **In the snapshot** each entry carries its date. Entries whose follow-up date has come appear first under due follow-ups; a follow-up stays due until the tutor edits or removes the entry.
- **The learner** sees the entries, newest first with their dates, in the Tutor settings section and can delete one or clear all. The learner cannot write or edit them.
- C14's `tutor_notes` text becomes one entry dated with its profile's `updated_at` when C14l is migrated; `update_tutor_notes` is retired.

## Practice topics

A topic is a short label for what a question practises, such as *modal verbs*, *times of the day*, or *separable verbs*, so the tutor can tell what was practised and when ("modal verbs, 3 days ago, 2 misses").

- Every `ask_*` call, plan step, note, and tutor word may carry a topic: plain text of 1–60 characters. Its **topic key** is the label trimmed, lowercased, and with inner whitespace collapsed. The label shown is the latest one used for that key.
- The topic is stored on the [practice attempt](courses.md#practice-attempts) and the [word reviews](words.md#word-memory) an answer writes.
- `get_recent_topics` (default the last 30 days, at most 90) returns each topic key with its label, the first and last practice dates, how many questions were answered and how many missed (no match and no acceptable verdict), the lessons it was practised under, and its tutor words. The snapshot's recent topics section holds the most recently practised ones.
- To keep keys consistent, the tutor reuses the labels the snapshot and `get_recent_topics` show and coins a new one only for a new subject.
- **Attempts without a lesson.** A tutor component tied to no lesson but carrying a topic or testing tutor words now records its attempt (source `ai_chat`) with no course or lesson, so topic history is complete. Lesson [reset](courses.md#reset) never touches these rows; they are kept like the rest of the learner's attempts.

## Tutor words

Tutor words are words the tutor teaches that are not in any lesson the learner can read, for example five extra words to go with *times of the day*.

- **A tutor word** has a term (at most 80 characters), a meaning (at most 200), optional forms (at most 120, such as an article or plural), an optional example sentence (at most 300), an optional topic, up to five related lessons, the conversation it was added in, and created and updated dates. One per term key per account.
- **Adding.** `add_tutor_words` (no confirmation; up to 10 per call, at most 500 per account) shows a step chip listing them. A term whose key is already a word of a readable published lesson is refused for that word with `WORD_IN_LESSON` and the lesson word's reference, so the tutor practises the lesson word instead. A term the learner already has as a tutor word is refused with `TUTOR_WORD_EXISTS`. `update_tutor_word` edits the meaning, forms, example, topic, or lessons; `get_tutor_words` lists them by topic, lesson, or weakness.
- **Memory.** [Word memory](words.md#word-memory) is keyed by term key, so a tutor word is reviewed and remembered exactly like a lesson word: tutor components may test tutor words (`words` takes tutor word references beside lesson words), each answer writes a review with the tutor word in place of a lesson word, and the ranking, Weak words view, and Drill treat them like any other word. If a lesson later teaches the same term, the reviews already form one memory with it.
- **On the Words tab** a third view, **From your tutor**, lists tutor words newest first, with the topic and related lessons in place of the course and lesson line, the speaker button, and **Remove**. The Weak words view and Drill's Weak words include them; Drill's Lesson source does not.
- **Removing** a tutor word (the learner, on the Words tab) deletes it with its reviews and observations and rebuilds the memory of its term key from what remains, like a lesson deletion. It asks for confirmation first. The tutor cannot remove tutor words.
- Tutor words are never shared: they cannot appear in AI practices saved for other learners, on profiles, or in the journal.

## Word observations

Beside the graded memory, the tutor keeps a soft signal: what it noticed about a word in free conversation.

- `observe_words` (no confirmation; up to 10 per call) records, for a lesson word or tutor word, `used_correctly` or `struggled` with an optional note of at most 200 characters.
- Observations **never change word memory**: recall, the weakness ranking, the dots, and Drill read graded reviews only. They reach only the tutor: the snapshot's word entries carry their latest observation and its date, and `get_tutor_words` and the word read tools return them. The learner sees them only as the tool step chips that recorded them.
- A word whose latest observation is `used_correctly` and that has no graded Again since is one the tutor may treat as mostly learned; it confirms that with a component before relying on it.

## Personal practices

The tutor can place practices on a lesson page for one learner only, for example a reading passage around the weak words of lesson 2.8 or questions that combine new tutor words with the lesson's words.

- `save_personal_practice` (no confirmation) takes the same payload and lesson tags as [AI practices](courses.md#ai-practices) (kinds including [reading](#reading-component), and words that may be tutor words) and is anchored after a block of the lesson's published document, with the same `ANCHOR_NOT_FOUND` check. At most 100 personal practices per account.
- **Visibility.** Only the learner sees them, on the lesson page's AI practices expander, labelled **Just for you**; the count on the Show AI practices (*n*) button includes them for that learner only. Course owners and contributors never see or count them.
- **Removal.** The learner removes one with Remove on the practice; the tutor cannot. Deleting a lesson removes its tags, and a practice left without tags is deleted. A lesson reset keeps them.
- Answers are graded and recorded like AI practice answers (source `ai_practice`), with the practice's topic.
- Saving a practice for everyone stays `save_ai_practice` with its confirmation card, and a shared practice cannot test tutor words (`TUTOR_WORD_NOT_SHAREABLE`).

## Reading component

A tenth [answer component](ai-tutor.md#answer-components), usable in the chat, in AI practices, and in personal practices.

- **Payload.** A target-language passage of at most 1,200 characters (with `[[...]]` spans the learner can play), an optional title, and 1–5 questions, each a multiple choice of 2–4 options or true/false, about the passage. Words and topic as for other components.
- **Answer.** One choice per question. Graded by the server alone; the grade lists each question's result. The view leaves out the correct options.
- **Recording.** One practice attempt per question (its item index), and for each tested word a review: Got it when every question is correct, Again otherwise, in the understand direction.

## Short references

The snapshot and tool results name lessons, words, tutor words, notes, and plans with short references (`L3`, `W12`, `T4`, `N2`, `P1`) instead of UUIDs, which cost about 22–25 tokens each.

- A reference is created the first time an ID is shown to the model in a conversation and stays the same for the life of the conversation. Tools accept references or full IDs; the API resolves both under the signed-in account, and an unknown reference fails like an unknown ID.
- References are only a prompt encoding: stored rows, API responses to the web, and stored tool steps keep full IDs.

## API

Routes sit under `/api/ai/...`, after authentication and completed setup; shapes are in the contracts' `tutor` subpath. Another account's IDs answer `404`.

- `GET /api/ai/plans?cursor=` lists the learner's plans, newest first, ten a page, each with its counts; `GET /api/ai/conversations/:id/plans` the conversation's plans, the active one first.
- `GET` and `PUT /api/ai/conversations/:id/context` read and replace a conversation's scope (`tutorContextScopeSchema`); a conversation without its own scope reads as the defaults. The learner's defaults are part of `GET` and `PUT /api/ai/profile` as `contextDefaults`.
- `GET /api/ai/notes` lists the notes; `DELETE /api/ai/notes/:noteId` deletes one; `DELETE /api/ai/notes` clears all (replacing `DELETE /api/ai/profile/notes`).
- `GET /api/ai/tutor-words?cursor=` lists tutor words newest first, twenty a page; `DELETE /api/ai/tutor-words/:wordId` removes one.
- Personal practices are read and answered through the lesson's AI practice routes (they carry `personal: true`); `DELETE .../ai-practices/:practiceId` removes a personal practice for its learner.

Data lives in [`ai_plans`](data-model.md#ai_plans), [`learner_notes`](data-model.md#learner_notes), [`tutor_words`](data-model.md#tutor_words), [`tutor_word_lessons`](data-model.md#tutor_word_lessons), [`word_observations`](data-model.md#word_observations), [`ai_conversation_refs`](data-model.md#ai_conversation_refs), and new columns on the learning and AI practice tables.

## Not in scope

- Timers, countdowns, or reminders outside the chat. Follow-up dates are read only when the learner talks to the tutor.
- Scores, streaks, or right-and-wrong counts in the session panel.
- The learner writing or editing tutor notes, or the tutor removing tutor words or personal practices.
- Sharing tutor words, notes, plans, or personal practices with anyone.
- Using observations in word memory.
