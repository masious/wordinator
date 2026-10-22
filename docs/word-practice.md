# Word practice

Status: experimental product change (2026-10-22), implemented, not yet deployed. It may be rolled back; the roadmap records it under [word practice and answer marks](roadmap.md#word-practice-and-answer-marks--completed-2026-10-22-not-yet-deployed).

A word practice is a short [AI tutor](ai-tutor.md) conversation (about two minutes) about up to 15 words the learner picked: words they just missed in a [drill](words.md#drill), words fading from [word memory](words.md#word-memory), and words of chosen lessons they never practised. This document owns the picker, the word practice conversation, the tutor's script, and practice word marks. The tutor's chat, tools, components, grading, and limits stay with [ai-tutor.md](ai-tutor.md).

## Starting

- The drill's [results page](words.md#end-of-session) has **Practise drill words and more** beside Drill again. It opens the picker.
- **The picker** lists the session's Again words first, all picked. Below them, a lesson select (at most 10 lessons, the drill's lessons to begin with) adds that lesson's words in two groups: **Weak** (memory more likely forgotten than not within the weak horizon, weakest first) and **Not practised yet** (no review in either direction). Words marked known, well-remembered words, and words sharing a term key with a drill word are left out; each term appears once.
- Until the learner changes a pick, the places the drill words leave are filled up to 15, weak and new words in turn. At 15 the other words cannot be picked until one is removed. Start practice creates the conversation and opens it.
- The conversation opens with a card listing the words (drill words highlighted) and **Start practice**, which sends a fixed message ("Let's practise my words."). Nothing is sent before it, as for any [new conversation](ai-tutor.md#entry-point).

## The conversation

- `POST /api/ai/conversations` takes `wordPractice`: 1–15 distinct word references, each with its source (`drill`, `weak`, or `new`). Every word is resolved under the learner's read rules; one they cannot read, or one of an archived course, refuses the request with `404 WORD_NOT_FOUND`. An empty body still starts an ordinary conversation.
- The words are kept on the conversation ([`ai_conversations.word_practice`](data-model.md#ai_conversations)) with each word's term and, for the web's word cards only, its meaning, forms, example, and note at the time of starting. The conversation's read returns them as `wordPractice`; other conversations have none. A word practice is otherwise an ordinary conversation: private, listed, archivable, and held to the [daily turn cap](ai-tutor.md#usage-and-limits).
- `GET /api/ai/word-practice?lessons=<id>,<id>` is the picker's read: the readable published lessons of courses that are not archived, in library order, and the weak and new words of the chosen ones. Unreadable lesson IDs are ignored; more than 10, or an invalid ID, is `400`.

## The tutor's script

- The system prompt gains a word practice section: the steps below and the words as compact references (number, lesson and word ID, term, and source), never their meanings, examples, or notes. The tutor reads those once with [`get_words`](ai-tutor.md#tools).
- **Rounds.** With more than 8 words the tutor works in two rounds, splitting the words in halves with the drill words in the first. Each round is a short passage (3 to 6 simple sentences) using every word of the round, shown with a [Spot the words](ai-tutor.md#answer-components) checklist; then one practice set of 3 to 5 questions on one or two words the learner did not recognise and one or two weak or new words they did; then a brief correction. After the last round the tutor ends with two or three lines on the words that went well and the ones to review.
- These are instructions to the model, not enforced steps; the conversation stays an ordinary chat the learner can steer.

## Practice word marks

- The tutor marks every practice word it writes, in the form it wrote it, as `{{form|n}}` with the word's number in the list, in its text (also inside `[[...]]` speech marks) and in Spot the words passages.
- The server parses the marks out like [target-language spans](ai-tutor.md#messages-and-formatting): a text part stores them as `words` (offsets into the text and the word's index), and a Spot the words view as `marks`. A number that is not in the list keeps its text without a mark; anything that is not a whole mark stays literal. Outside a word practice every mark keeps only its text. Streamed text is parsed the same way as it arrives.
- The web shows a mark as a warm highlight. Hovering it or focusing it with the keyboard opens the word's card: the term with its forms, the meaning, the example, and the note. In a Spot the words passage the card opens only once the checklist is sent, so it cannot give a meaning away. A conversation started before the cards were kept shows the term only.
- Earlier messages go back to the model without their marks; the prompt's rule applies afresh each turn.

## Not in scope

- Editing the word list after the conversation starts; the start card is read-only.
- Word practices from other entry points. (Word batches add a `batch` source; see [words](words.md#word-batches) once that change lands.)
