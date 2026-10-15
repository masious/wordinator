# Words

Status: C9 (word cards, bookmarks, and the Words tab) delivered; its release is tracked in [WORDS_PLAN.md](../WORDS_PLAN.md). C12 (lesson filter, spoken reveal, and Drill) is an approved product change (2026-10-12) in progress: C12a (lesson filter), C12b (spoken reveal), C12c (drill contracts and data), C12d (drill API), and C12e (drill web) are complete; the release is pending. C13 (spoken answers on Produce drill cards and Words tab word cards, approved 2026-10-15) is complete in the web; its release goes with C12. Delivery is tracked in [DRILL_PLAN.md](../DRILL_PLAN.md). Phases are tracked in the [roadmap](roadmap.md#course-phases).

Words builds on [new words and recap](courses.md#new-words-and-recap). Lessons define words; this document owns how learners review them several at a time, bookmark them, come back to them in a Words tab, and drill them.

## Word cards

C9a replaces the one-card recap slideshow with a page of cards. Every surface that reviews words uses it: the lesson recap, a lesson's [Review words](courses.md#lesson-actions) on the course page, the course recap, and the Words tab.

- **Page size.** Cards have a fixed height. Columns follow the width available to the grid: one below `40em`, then as many cards of the minimum card width as fit, at most three. Rows are as many full cards as fit in the height available to the grid without scrolling the page, at least one. A page holds columns × rows cards. Resizing recomputes it and keeps the page that holds the first visible word.
- **Navigation.** The counter shows the range and total ("Words 1–6 of 40", or "Word 3 of 40" for a single card). Back and Next move by a page. On the last page of a recap, Next becomes the recap's done action; the Words tab has no done action.
- **Flip in place.** A card's front shows the term and forms. Show meaning flips the card to its back: the term in a smaller size, then the meaning, example, and note. Hide meaning flips it back. The card keeps its height; text longer than the back can hold scrolls inside the card. The flip is a short rotation, removed under reduced motion. The toggle keeps focus and its label follows the side shown.
- **Spoken reveal** (C12). Show meaning on a single card also plays the term's audio, when it is [ready](speech.md#playback) and the reveal sound is on. Hide meaning and Show all play nothing, so several cards never speak at once. A sound toggle beside the counter turns the reveal sound on or off; it is on by default and remembered on the device. With no ready clip the reveal is silent.
- **Show all.** Flips every card on the current page; when every card on the page is revealed it becomes Hide all. It is offered when the page holds more than one card. Changing page or page size shows every card's front again.
- **Speech.** A card's front has a speaker button for the term, and its back for the term and the example, where their audio is [ready](speech.md#playback).
- **Bookmark.** Each card carries a bookmark toggle on both sides (see [bookmarks](#bookmarks)), except where bookmarks are not offered.
- **Say it** (C13, Words tab only). A round microphone at the start of the card's footer lets the learner say the term aloud; see [spoken answers](#spoken-answers).
- Nothing on a word card is graded, timed, or recorded (a spoken word's verdict is shown for a moment and kept nowhere); a bookmark is the only thing a card saves, and cards keep their order. Grading belongs to [Drill](#drill) only.

## Bookmarks

C9b lets a learner save words to come back to later.

- **Where.** A bookmark toggle appears on word cards and on every word in a [New words](courses.md#words-in-the-player) list: the player's panel, the words step, the reader's word list, and the lesson page's [New words panel](courses.md#lesson-pages) (sticky beside the text, or a bar at the bottom of narrow screens), where it sits in an opened word's details, including a Library search match, which bookmarks the word in the lesson that introduced it. Toggling a word in that panel never changes its highlight or scrolls the panel. A learner may bookmark words of lessons they have not finished.
- **Published words only.** Bookmarks are offered only for words of a lesson's published document. A preview of unpublished changes and a draft show no toggle.
- **Reference, not copy.** A bookmark is the learner's key to a word, `(lesson, word ID)`; its text is read from the [`course_lesson_words`](data-model.md#course_lesson_words) index. An author's edits therefore show in bookmarks. A word that leaves the published document (edited out or the lesson unpublished) is hidden while it is gone and returns if a later publish brings back the same word ID. Deleting the lesson or course deletes its bookmarks.
- **Visibility.** Bookmarks show only while the learner can still see the course under the course read rules.
- **Private.** Bookmarks belong to one account. Nobody else sees them, nothing counts them, and they create no notifications or feed activity.
- **Duplicates.** The same term from two lessons is two words with two bookmarks, and the Words tab shows both. The course recap shows a repeated term once, at its first occurrence, so its toggle bookmarks that occurrence.
- **Limit.** An account holds at most `WORD_BOOKMARKS_MAX` (2,000) bookmarks; a further bookmark is refused with a message.
- Toggling is optimistic and reverts with a message if the request fails.

## Words tab

The Words destination sits in the main navigation at `/words`, between Courses and Journal.

- The page shows the learner's bookmarked words as [word cards](#word-cards), newest bookmark first. Each card names its course and lesson.
- Removing a bookmark on the tab leaves the card in place, shown as not bookmarked and able to be bookmarked again, until the learner leaves the page or changes the filter, so the grid does not jump.
- Pages of bookmarks load as Next reaches the end of those already loaded.
- With no bookmarks, the page explains how to bookmark a word from a lesson.
- **Lesson filter** (C12). A select above the cards narrows them to one lesson. It lists only lessons that hold at least one visible bookmark, grouped by course (oldest course first, so a course's parts read in order) and then by lesson position, each with its bookmark count; All lessons is the default. A lesson whose last bookmark is removed while it is chosen stays listed, with a count of 0, until the page is left, so its cards stay in place. The filter lives in the URL (`/words?lesson=<lessonId>`), so it survives reload and back. An unknown or no longer visible lesson falls back to All lessons. Filtering is done by the API, not over loaded pages.
- **Drill** (C12). A Drill button opens the [drill setup](#drill).
- The tab shows no score, percentage, streak, due count, or "known" state, and never marks which words are weak.

## Drill

C12 adds self-graded flashcard drilling of words, one card at a time. It is called Drill; "Practice" keeps meaning [practice blocks](courses.md#practice-answers) and "Review words" keeps meaning the recap.

### Setup

The Drill button opens a small dialog with two choices and Start:

- **Words.** Weak words (the default) shuffles the learner's bookmarked words, weakest first; Lesson drills every word of one lesson, chosen from a lesson select that defaults to the Words tab's current filter. Weak words is disabled, with a line explaining how to bookmark, while the learner has no visible bookmarks.
- **Direction.** Mixed (the default), Understand *language* (term → meaning), or Produce *language* (meaning → term), where *language* is the library's language (Dutch or German).

Start opens `/words/drill?source=weak|lesson&lesson=<lessonId>&direction=mixed|understand|produce`. Unknown settings fall back to Weak words and Mixed, and `lesson` is kept only for a lesson drill. The Lesson choice is disabled while the filter lists no lesson. The drill page is desktop-only, like other new work. A lesson the viewer cannot read shows that the lesson is not available, with Back to words.

### The deck

A session holds at most `WORD_DRILL_SESSION_SIZE` (20) cards, or fewer when fewer words are eligible.

- **Weak words** draws from the learner's visible bookmarks. **Lesson** draws from every word of the lesson's published document, bookmarked or not, under the lesson read's visibility rules.
- **One term per session.** Words are compared by their term's search key (`wordSearchKey`), and a session holds each key once, in one direction only. So a mixed session that asks for *vrij* never also asks for *free*, and *vrij* from two lessons appears once. Of words sharing a key, the weakest is kept.
- **Direction.** In a single-direction session every card uses that direction. In a mixed session each word uses its weaker direction, the one that ranks higher by the priority below (so box 1 is weaker than never drilled, which is weaker than box 2); ties are random.
- **Priority** for the card's direction, highest first: words last graded Again (box 1), then words never drilled in that direction, then box 2, 3, 4, 5. Within a tier, the longest since last drilled comes first, and ties are random. Weak words takes the first 20 by priority; Lesson takes the lesson's words in priority order up to 20.
- The chosen cards are shuffled before the session starts, so a session's order does not reveal its priority.

### A card

- **Understand:** the front shows the term (and forms) with its speaker button. **Produce:** the front shows the meaning, the course and lesson names as context, and the example with the term replaced by a blank when the example contains it; it shows no forms and no term audio. The example is compared by search key (`wordSearchKey`), every occurrence is blanked, and a term that starts with an article (*de*, *het*, *een*, *der*, *die*, *das*, and the other German forms) is also looked for without it, so *het kaartje* blanks *kaartje*. Inflected forms are not looked for. When the term is not found, the front leaves the example out, since an inflected or separated form (*Ik bel mijn moeder* for *bellen*, *Ik pak het in* for *inpakken*) would give the answer away; the back still shows it. See [Deferred](#deferred) for wider matching.
- Show answer flips the card in place, like a [word card](#word-cards), and always reveals the full word: term, forms, meaning, example, and note. Revealing plays the term's audio in both directions, under the same sound toggle as word cards.
- Once revealed, two buttons grade the card: **Again** and **Got it**. Keyboard: Space reveals; `1` is Again and `2` is Got it.
- **Again** puts the card back three to five cards later in the session (at the end when fewer remain). **Got it** retires it. The session ends when every card has been retired.
- Only a card's **first** grade in a session is recorded; repeats after Again only retire the card. The grade is saved as soon as it is given, so leaving midway loses nothing.
- A mono counter shows cards retired of the session total. There is no timer.
- A grade that cannot be saved does not stop the session: a quiet line says how many answers were not saved, with Try again, and stays on the summary until they are.
- A card whose word disappears mid-session (edited out or unpublished) still finishes from the session's copy; its grade is refused and ignored.

### Spoken answers

C13 (approved product change, 2026-10-15) lets a learner say words aloud and hear back whether the browser understood them, in two places only: **Produce** drill cards, and word cards on the **Words tab**. Understand drill cards do not listen (their answer is a meaning in English, which is long and has synonyms), and neither do the lesson and course word recaps, lessons, or practice blocks; see [Deferred](courses.md#deferred).

- **Support.** Listening uses the browser's speech recognition (the Web Speech API: Chrome, Edge, and Safari; not Firefox). Where the browser has none, no microphone is shown.
- **Listening.** Pressing a microphone stops any playing clip and listens for one utterance in the library's language (`nl-NL` or `de-DE`, the accents of the [speech voices](speech.md#voices)); pressing it again while it listens stops early. The browser's microphone permission prompt is the only consent. While it listens, the button takes an action tint, its microphone breathes, and rings ripple out from it (one still ring under reduced motion).
- **Matching** is lenient and runs in the browser: the recognizer's alternatives (up to five) are compared with the term by search key (`wordSearchKey`) after dropping punctuation and `…`, and a leading article is optional on either side, so *kaartje* answers *het kaartje*. The article is therefore not checked. Inflected forms and the word's forms are not accepted.
- **Drill card.** A Say it button (microphone icon, keyboard `M`) sits beside Show answer on a Produce front, with a small Click to stop hint below it while it listens. Any recognized answer reveals the card exactly like Show answer (including the term's sound), with a verdict badge heading the back: **Matches!** (success tone, check icon, a brief glow) or **Not quite** (ochre highlight, cross icon, a small shake; a nudge, not an error), each with You said “…” in mono. The badge pops in as the flip lands; under reduced motion it simply appears. It never grades: the learner still chooses Again or Got it, so a misheard word cannot move a Leitner box. When nothing is recognized the front stays, with a quiet status line; a blocked microphone and an unavailable recognizer say so instead.
- **Word card.** The term is already on the card, so this is pronunciation practice: a round, icon-only microphone (labelled Say *term*, Stop listening while it listens) at the start of the footer. The outcome (the same verdict badge in a compact size, or a short line when nothing was heard or the microphone is blocked) floats over the card's lower half and fades away after 3.5 seconds (`PASSING_VERDICT_MS`); clicking it dismisses it early, and listening again clears it. It does not flip the card, play audio, or save anything. There is no keyboard shortcut, since a page holds several cards.
- **Privacy.** Recognition is the browser's, and some browsers send the audio to their vendor; Wordinator never receives or stores audio or transcripts. See [security and privacy](security-and-privacy.md#spoken-drill-answers).

### End of session

A short summary says how many cards were Got it on the first try and how many needed Again, then offers Drill again (same settings, a fresh deck) and Back to words. It shows no score or comparison with earlier sessions.

### Memory: Leitner boxes

- Each account keeps, per word and direction, a box from 1 to 5 and the time and result of its last first-grade. Understand and Produce are tracked separately. A word never drilled in a direction has no box.
- **Got it** moves the box up one (a first Got it on a new word lands in box 2), at most 5. **Again** sends it to box 1.
- Boxes only order decks. There are no due dates, intervals, or overdue counts.
- State is a reference like a bookmark: it survives removing and re-adding a bookmark, an author's edits to the word, and the word's temporary removal; deleting the lesson or course deletes it.
- **Private.** State belongs to one account, is never shown to anyone (including its owner, beyond deck order and the end-of-session summary), and creates no notifications or feed activity. Only the latest state is stored, never a history of answers.

### Deferred

Blanking misses many examples. A rough count over the Dutch course content on 2026-10-12 found 915 words with an example: the term (without a leading article) appears in 581; the word's forms would add about 95, and matching single words by a shared start (*bel* and *bellen*, *blijft* and *blijven*) about 70 more. About 170 would still miss: phrases with punctuation or `…` (*Zullen we …?*), conjugated phrases (*zin hebben in* → *Ik heb zin in*), and separable verbs (*inpakken* → *Ik pak het cadeautje in*). Ideas, cheapest first:

- **Match more automatically:** also look for the word's forms (split on `·`), ignore punctuation and `…` when matching phrases, and for single words accept an example word sharing a long enough start with the term or a form. The shared-start rule can now and then blank a similar but unrelated word, which is harmless on a practice card.
- **Mark the blank in the content:** let the author mark the word's span in the example (for example `Ik [bel] mijn moeder`, `Ik [pak] het cadeautje [in]`), stored with the word. Exact for every case, but it changes the lesson document contract, the editor, and the published word index, and needs a backfill pass over existing lessons.

## Word search

The lesson page's [New words panel](courses.md#lesson-pages) has a search box above its words and a switch between This lesson and Library.

- **Folding.** Both modes compare search keys from `wordSearchKey` in the contracts: lower case, diacritics removed by Unicode decomposition, `ß` as `ss`, and runs of whitespace as one space, so `uber` finds `Über`. A query matches when its key is a substring of the key of a word's term, forms, or meaning.
- **This lesson** (the default) filters the panel's own words in the browser; nothing is requested. Highlighting and scrolling to the words on screen keep working on the filtered list, and an empty result says that no word in the lesson matches.
- **Library** searches the words of every published lesson the viewer may see, across courses, through the API. Requests wait until typing pauses for 300 ms (`WORD_SEARCH_DEBOUNCE_MS`) and are cached by TanStack Query per query. Matches come twenty at a time with Show more matches. Each match is a [panel row](courses.md#lesson-pages) like the lesson's own words; opening it also shows its bookmark toggle (for the lesson that introduced the word) and a Learnt in *lesson* (*course*) link to that lesson's page. The containing lesson is no longer behind a separate icon with a tooltip (approved product change, 2026-10-11). With an empty query the panel explains what Library searches; while it searches, after a failure, and with no match it says so.
- **Order.** Terms that start with the query come first, then terms that contain it, then words that match only by forms or meaning; each group by term key, then lesson and word ID.
- **Visibility.** Library search returns only words of published lessons (the [word index](data-model.md#course_lesson_words) holds nothing else) in courses the viewer can see under the course read rules, and never from archived courses, not even for their owner. Draft courses show to their owner and active contributors only.
- Search does not record anything, rank by popularity, or remember queries. The same term in two lessons is two matches.

## API

The routes still sit under `/api/groups/:groupId/...`, where `groupId` is the installation's single backing library record (see [storage compatibility](groups-and-membership.md#storage-compatibility)); the web resolves it from the session and never shows it. Every route runs after that compatibility middleware and scopes every ID by it. Courses and lessons the viewer may not see return the same `404` as missing ones.

- `PUT .../courses/:courseId/lessons/:lessonId/words/:wordId/bookmark` bookmarks a word; it is idempotent and keeps the first timestamp. `404` unless the word is in the lesson's published index row for that course. `409 WORD_BOOKMARKS_FULL` at the limit.
- `DELETE` on the same path removes the viewer's bookmark; idempotent.
- `GET .../word-bookmarks/keys` returns `{ keys: [{ lessonId, wordId }] }`, every bookmark key of the viewer (bounded by the limit). The web keeps it as one query that marks toggles on every surface and updates it optimistically.
- `GET .../word-bookmarks?cursor=&lessonId=` returns the visible bookmarks, newest first, with the word, course and lesson IDs and titles, and the bookmark time, as `(created_at, lesson_id, word_id)` cursor pages. `lessonId` (C12) limits the page to one lesson; a lesson the viewer cannot see returns an empty page, and a malformed one `400 INVALID_FILTER`.
- `GET .../word-bookmarks/lessons` (C12) returns `{ lessons: [{ course: { id, slug, title }, lesson: { id, slug, title }, count }] }`: each lesson holding at least one visible bookmark (`wordBookmarkLessonsResponseSchema`), oldest course first and then by lesson position, with its visible bookmark count. It feeds the lesson filter and the drill setup.
- `GET .../word-drill?source=weak|lesson&lessonId=&direction=mixed|understand|produce` (C12) returns `{ cards: [{ word, direction, course: { id, slug, title }, lesson: { id, slug, title } }] }`: the shuffled deck built by the [deck rules](#the-deck), each word with its `speech`. `lessonId` is required for `source=lesson` and refused otherwise (`400 INVALID_DRILL`, also for unknown settings). A lesson the viewer cannot read (missing, unpublished for a learner, or in a course they cannot see) is `404 LESSON_NOT_FOUND`. An empty deck is `{ cards: [] }`.
- `PUT .../courses/:courseId/lessons/:lessonId/words/:wordId/drill/:direction` (C12) with `{ result: "got" | "again" }` records a first grade and returns the new `{ box }`. An unknown direction or a malformed body is `400 INVALID_DRILL`; a course the viewer cannot see is `404 COURSE_NOT_FOUND`, and a word not in the lesson's published index for that course `404 WORD_NOT_FOUND`, writing nothing. It is not idempotent: each call moves the box, so the web sends one per card per session.
- The course words response carries each word's `lessonId` so the course recap can toggle bookmarks.
- `GET .../word-search?q=&cursor=&limit=` ([word search](#word-search)) returns `{ items: [{ word, course: { id, slug, title }, lesson: { id, slug, title } }], nextCursor }` (`wordSearchPageSchema`). `q` is 1–100 characters after trimming (`WORD_SEARCH_QUERY_MAX`), `limit` defaults to 20 and is at most 50 (`WORD_SEARCH_PAGE_MAX`); otherwise `400 INVALID_SEARCH`. A query whose key is empty returns no matches. The cursor names the last word returned (`400 INVALID_CURSOR` when malformed); a page after a word that no longer matches is empty.

Data lives in [`course_word_bookmarks`](data-model.md#course_word_bookmarks) and [`course_word_drill_states`](data-model.md#course_word_drill_states).
