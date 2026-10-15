# Words

Status: C9 (word cards, bookmarks, and the Words tab) delivered; its release is tracked in `WORDS_PLAN.md` (removed in `5421176`; see git history). C12 (lesson filter, spoken reveal, and Drill) is an approved product change (2026-10-12) in progress: C12a (lesson filter), C12b (spoken reveal), C12c (drill contracts and data), C12d (drill API), and C12e (drill web) are complete; the release is pending. C13 (spoken answers on Produce drill cards and Words tab word cards, approved 2026-10-15, with a choice of the browser's or Microsoft's recognizer, and Microsoft's pronunciation assessment) is complete; its release goes with C12. Delivery is tracked in `DRILL_PLAN.md` (removed in `6db849b`; see git history). C14 (approved product change, 2026-10-15, planned) replaces Drill's Leitner boxes with [word memory](#word-memory) before C12 is released, adds the [Weak words view](#weak-words-view), and stores [pronunciation scores](#pronunciation-assessment) for the learner and the [AI tutor](ai-tutor.md); delivery is tracked in [AI_PLAN.md](../AI_PLAN.md). Phases are tracked in the [roadmap](roadmap.md#course-phases).

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
- Nothing on a word card is graded or timed, and cards keep their order. A bookmark is the only thing a card saves, except that a Microsoft [pronunciation assessment](#pronunciation-assessment) of a spoken word is stored as a pronunciation attempt (C14); the match verdict itself is kept nowhere. Grading belongs to [Drill](#drill) and the [AI tutor](ai-tutor.md#answer-components).

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
- **Views** (C14). A switch above the cards chooses Bookmarks (the default, described above) or [Weak words](#weak-words-view). The choice lives in the URL (`/words?view=weak`); the lesson filter belongs to Bookmarks only.
- The tab shows no score, percentage, streak, or due count. The Weak words view's dots are the only sign of how well a word is known.

## Weak words view

C14 (approved product change, 2026-10-15) makes weakness visible, so a learner can see which words keep slipping.

- **What it lists.** Every word the learner has [memory](#word-memory) for in either direction, bookmarked or not, one row per term key, weakest first by the shared [weakness ranking](#word-memory): the lower projected recall of its reviewed directions (a direction never reviewed does not count here), then the longest since that direction was last reviewed, then the term key. A row shows its representative occurrence, or another visible occurrence of the term when the learner can no longer see that one; terms with no visible occurrence are left out, and so are words marked known.
- **A row** shows the term with its speaker button, the meaning, the course and lesson of its representative occurrence, and **5 dots** for its last five results in either direction, oldest left: filled in the success tone for Got it, filled in the danger tone for Again, and hollow where there are fewer than five results. There are no percentages, scores, or due dates. Each row has a bookmark toggle (for the occurrence shown) and an I know this word action that sets `known_override` on both directions and removes the row at once (it comes back with a message if the request fails); a later Again in either direction clears the mark in both.
- Rows load in cursor pages of twenty as the learner scrolls (with a Show more words button for keyboards). **Drill these words** opens a mixed Weak words drill; it is disabled while the list is empty.
- With no memory yet, the view explains that words appear here after Drill or practice with the tutor.
- The view is private to the learner like the rest of their memory.

## Drill

C12 adds self-graded flashcard drilling of words, one card at a time. It is called Drill; "Practice" keeps meaning [practice blocks](courses.md#practice-answers) and "Review words" keeps meaning the recap.

### Setup

The Drill button opens a small dialog with two choices and Start:

- **Words.** Weak words (the default) draws the learner's weakest words from [word memory](#word-memory) and their bookmarks (C14; before C14 it drew bookmarks only); Lesson drills every word of one lesson, chosen from a lesson select that defaults to the Words tab's current filter. Weak words is disabled, with a line explaining how to bookmark, while the learner has neither visible bookmarks nor memory.
- **Direction.** Mixed (the default), Understand *language* (term → meaning), or Produce *language* (meaning → term), where *language* is the library's language (Dutch or German).

Start opens `/words/drill?source=weak|lesson&lesson=<lessonId>&direction=mixed|understand|produce`. Unknown settings fall back to Weak words and Mixed, and `lesson` is kept only for a lesson drill. The Lesson choice is disabled while the filter lists no lesson. The drill page is desktop-only, like other new work. A lesson the viewer cannot read shows that the lesson is not available, with Back to words.

### The deck

A session holds at most `WORD_DRILL_SESSION_SIZE` (20) cards, or fewer when fewer words are eligible.

- **Weak words** draws from the learner's visible bookmarks and every word they have memory for whose lesson they can still see (C14). **Lesson** draws from every word of the lesson's published document, bookmarked or not, under the lesson read's visibility rules.
- **One term per session.** Words are compared by their term's search key (`wordSearchKey`), and a session holds each key once, in one direction only. So a mixed session that asks for *vrij* never also asks for *free*, and *vrij* from two lessons appears once. Of words sharing a key, the weakest is kept.
- **Direction.** In a single-direction session every card uses that direction. In a mixed session each word uses its weaker direction, the one that ranks higher by the priority below; ties are random.
- **Priority** for the card's direction, highest first, is the lowest [recall probability](#word-memory) projected `WORD_WEAK_HORIZON_DAYS` (7) days from now, the weakness ranking the Weak words view shares (C14; it replaces the Leitner box tiers). A word never reviewed in that direction counts as `WORD_NEW_RECALL` (0.5), so words more likely forgotten than not come before new ones and well-known words after them. Ties go to bookmarked words, then to the longest since last reviewed, then at random. Words marked known come last. Weak words takes the first 20 by priority; Lesson takes the lesson's words in priority order up to 20.
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

- **Support.** Listening uses one of two exchangeable [recognizers](#recognizers). Where neither can run (no microphone access at all), no microphone is shown.
- **Listening.** Pressing a microphone stops any playing clip and listens for one utterance in the library's language (`nl-NL` or `de-DE`, the accents of the [speech voices](speech.md#voices)); pressing it again while it listens stops early. The browser's microphone permission prompt is the only consent, whichever recognizer listens. While it listens, the button takes an action tint, its microphone breathes, and rings ripple out from it (one still ring under reduced motion).
- **Matching** is lenient and runs in the browser: the recognizer's alternatives (up to five) are compared with the term by search key (`wordSearchKey`) after dropping punctuation and `…`, and a leading article is optional on either side, so *kaartje* answers *het kaartje*. The article is therefore not checked. Inflected forms and the word's forms are not accepted.
- **Drill card.** A Say it button (microphone icon, keyboard `M`) sits beside Show answer on a Produce front, with a small Click to stop hint below it while it listens. Any recognized answer reveals the card exactly like Show answer (including the term's sound), with a verdict badge heading the back: **Matches!** (success tone, check icon, a brief glow) or **Not quite** (ochre highlight, cross icon, a small shake; a nudge, not an error), each with You said “…” in mono. The badge pops in as the flip lands; under reduced motion it simply appears. It never grades: the learner still chooses Again or Got it, so a misheard word cannot change [word memory](#word-memory). When nothing is recognized the front stays, with a quiet status line; a blocked microphone and an unavailable recognizer say so instead.
- **Word card.** The term is already on the card, so this is pronunciation practice: a round, icon-only microphone (labelled Say *term*, Stop listening while it listens) at the start of the footer. The outcome (the same verdict badge in a compact size, or a short line when nothing was heard or the microphone is blocked) floats over the card's lower half and fades away after 3.5 seconds (`PASSING_VERDICT_MS`); clicking it dismisses it early, and listening again clears it. Once an answer is recognized, right or wrong, the term's pronunciation plays, under the same reveal sound toggle as Show meaning (so nothing plays while it is off, and nothing plays when nothing was heard). It does not flip the card or save anything. There is no keyboard shortcut, since a page holds several cards.
- **Privacy.** Audio goes from the browser to the chosen recognizer's service, never through Wordinator, and Wordinator never stores audio or transcripts. Microsoft's pronunciation scores are stored (C14; see [pronunciation assessment](#pronunciation-assessment)). See [security and privacy](security-and-privacy.md#spoken-drill-answers).

### Listening feedback

A listen shows what it is doing at every step, so a slow start or a silent microphone never looks like nothing happening. Both [recognizers](#recognizers) report the same phases:

| Phase | When | Button | Hint |
| --- | --- | --- | --- |
| Getting ready | from the press until the microphone (and, for Microsoft, the token, SDK, and connection) is ready | spinner, gently pulsing tint | Starting the microphone… |
| Listening | ready, no speech yet | slow ripples, breathing microphone | Speak now · click to stop |
| Hearing you | speech detected | a ring that swells with the microphone's volume over a quick ripple | the words heard so far, “kaar…” |
| Checking | speech ended, answer not back yet | spinner, gently pulsing tint | Working out what you said… |

- **Capture.** Each listen opens one microphone capture with the browser's echo cancellation, noise suppression, and automatic gain, so the device's own speakers and steady background noise are damped. Its level, read about sixty times a second (Web Audio), drives the rings with either recognizer. Microsoft hears this capture itself: an audio worklet taps it, resamples it to 16 kHz 16-bit mono PCM, and pushes it into the Speech SDK. The browser recognizer captures the microphone on its own, so the capture only meters beside it. Without microphone access or Web Audio, the rings simply follow the phase.
- **Ending an answer.** The app ends an answer itself instead of relying only on the recognizer's silence detection, which steady noise can hold open: it tracks the background level (ignoring a capture's initial digital silence), counts sound more than a margin above it as speech, and finishes the answer after 0.9 seconds back near the background (`END_SILENCE_MS`) or at the latest 6 seconds after speech began (`MAX_ANSWER_MS`); terms are a word or a short phrase. The recognizer's own end-of-speech still ends it sooner when it comes first.
- **Pressing again** while listening finishes the answer and keeps what was said: the browser recognizer is asked for its final result, and Microsoft's audio stream is closed so Azure recognizes and assesses what it has. Only leaving the card cancels a listen. A press while still getting ready cancels it, since nothing has been heard. (Where a browser has no audio worklet, Microsoft reads the processed stream itself and an early press there ends without a result.)
- **Nothing heard.** When the microphone stays near silent for 3 seconds (`QUIET_NUDGE_MS`) while listening, the hint changes to “Can't hear anything yet. Is the right microphone on?” in the danger ink, and goes back as soon as there is sound.
- **Words heard so far.** The browser recognizer is asked for interim results and Microsoft reports partial recognitions; they are shown only as a hint and never decide the verdict.
- **Where.** The drill card's Say it button names the phase and shows the hint below it. A word card's round button changes its icon and rings, and the hint floats over the card where the verdict will appear, until the verdict replaces it.
- Under reduced motion the spinner, ripples, and volume rings are still; the labels and hints carry the feedback.

### Recognizers

Spoken answers can be heard by either of two recognizers behind one interface (`useSpokenAnswer` in the web's `speechRecognition` molecule). Both listen for one utterance in the library's locale and return up to five alternatives, best first, for the same [matching](#spoken-answers).

- **Browser** (the default): the browser's Web Speech API, available in Chrome, Edge, and Safari. Chrome and Edge send the audio to Google or Microsoft; Safari may recognize on the device.
- **Microsoft**: Azure AI Speech through Microsoft's Speech SDK for JavaScript, which the web loads only when it first listens. It needs only microphone access, so it works in every current browser, Firefox included. The API trades the Azure key for a ten-minute token (`POST /api/groups/:groupId/speech-recognition/token`, members only, returning `{ token, region, expiresAt }` with a minute's margin); the web reuses it until `expiresAt` and forgets it when Azure refuses it. The SDK streams the app's processed microphone capture (see [listening feedback](#listening-feedback)) from the browser straight to Azure in the Speech resource's region (`germanywestcentral`) and returns Azure's detailed alternatives (display and lexical forms). The route answers `503 SPEECH_RECOGNITION_UNAVAILABLE` when the Worker has no Azure key or Azure refuses to issue a token. The web first asks for the microphone itself, so a blocked microphone is told apart from a failing service.
- **Choosing.** Settings has a Speech recognition control (Browser or Microsoft) beside Appearance. The choice is kept per device in local storage (`wordinator:speech-recognizer:v1`), not on the account, since what works depends on the browser; it applies to every listening surface at once, and a change is picked up at the next listen. Where the browser has no recognizer of its own, Microsoft listens whatever the choice, and the setting says so.

### Pronunciation assessment

When **Microsoft** listens, it also assesses how the term was pronounced (Azure's scripted pronunciation assessment, approved 2026-10-15). The [browser recognizer](#recognizers) cannot, so with it a spoken answer is exactly the verdict described above; recognizers that assess return the assessment with the answer, and those that do not return none, so either can be swapped in.

- **Request.** The reference text is the term with punctuation and `…` removed (*Zullen we …?* is assessed as *Zullen we*), graded out of 100 at word granularity with miscue on, so missed and extra words are named. The match verdict is still decided by [matching](#spoken-answers), not by the scores.
- **What is shown.** For Dutch and German, Azure gives an overall pronunciation score; accuracy (how closely the sounds match a native speaker), fluency (pauses between words), and completeness (how much of the term was said); and per word an accuracy score and an error: mispronounced (Azure flags words under 60), not heard (omission), or extra (insertion). Prosody, syllables, and named phonemes are English-only in Azure and are not requested; phoneme scores without names are not shown.
- **Bands.** 80 and above is good (success tone), 60–79 fair (ochre), under 60 weak (danger tone): `SCORE_GOOD` and `SCORE_FAIR`.
- **Drill card.** The verdict badge ends in a ring that sweeps to the overall score. Below it, three meters (Accuracy, Fluency, Completeness) and the term's words as chips tinted by band, each with its score or error.
- **Word card.** The passing badge ends in a small score ring and becomes a button: clicking it before it fades opens a Pronunciation details panel over the card with the same meters and word chips, which stays until closed (or until the next listen). A badge without an assessment still dismisses on click.
- **Stored scores** (C14, approved product change 2026-10-15; this reverses the earlier rule that scores were never stored). Each assessment is sent to the API and stored as a pronunciation attempt: the surface (`drill`, `word_card`, or `ai_chat`), the reference text, the term key, lesson, and word where there is one, the overall, accuracy, fluency, and completeness scores, the per-word scores and errors, and the time. Audio and transcripts are still never sent. Attempts are private to the learner; the [AI tutor](ai-tutor.md) reads them to pick what to practice, and nothing else shows them yet. A failed save is ignored and never blocks the card.
- Scores do not affect grades or [word memory](#word-memory).

### End of session

A short summary says how many cards were Got it on the first try and how many needed Again, then offers Drill again (same settings, a fresh deck) and Back to words. It shows no score or comparison with earlier sessions.

### Word memory

C14 (approved product change, 2026-10-15) replaces C12's Leitner boxes before C12 is released. Memory now has a full history and a model of forgetting, so the Weak words view, Drill, and the [AI tutor](ai-tutor.md) all rank words the same way.

- **Review log.** Every graded answer appends a word review: the term key, the direction (`understand` or `produce`), the result (`got` or `again`), the source (`drill`, `ai_chat`, `ai_practice`, or `seed`), the lesson and word ID of the occurrence answered, the tutor conversation when there is one, and the time. Reviews are never edited; only a lesson [reset](courses.md#reset) and lesson deletion remove them.
- **What counts as a review.** A Drill card's first grade in a session (Got it or Again), a Quick review card in the tutor, and each lesson word a tutor [answer component](ai-tutor.md#answer-components) or an AI practice tests: a correct or acceptable answer is `got`, anything else `again`. Lesson practice answers write [practice attempts](courses.md#practice-attempts), not reviews, because a practice item does not name its words.
- **Memory row.** Per account, term key (`wordSearchKey` of the term), and direction, the API keeps one row folded from that term's reviews with an FSRS-style model: stability (the days until recall falls to 90%), difficulty, reps, lapses, the last lapse, the last review, the last ten results, the representative lesson and word (the most recently reviewed occurrence), and `known_override`. Keying by term key means *vrij* reviewed in two lessons is one memory, as Drill already treats it as one card.
- **Recall probability** is computed at read time from stability and the time since the last review, so words fade without any write. It is never shown as a number.
- **Weakness ranking.** The [Weak words view](#weak-words-view) and the [deck](#the-deck) rank by one shared function: recall probability projected `WORD_WEAK_HORIZON_DAYS` (7) days from now, not now, then the longest since last reviewed. Recall now would rank a word failed moments ago (recall near 1) after never-reviewed words for days; a week ahead its short stability puts it first, while long-stable words stay last. A word never reviewed in a direction counts as `WORD_NEW_RECALL` (0.5) in the deck. A word whose latest result in a direction is Again ranks at most `WORD_LAPSE_RECALL` (0.4) in that direction, so every fresh mistake comes before never-reviewed words even when it kept some stability; the next Got it lifts the cap.
- **Folding and rebuilding.** Each review updates its memory row in the same D1 batch. Rebuilding a row from its remaining reviews gives the same row as folding them one by one, which is how a reset or lesson deletion recomputes the terms it touched: a word also learnt in another lesson stays known through that lesson's reviews.
- **Seeding.** The C14 migration turns each C12 drill state into one `seed` review (its last result at its last drilled time) and a memory row whose stability follows its box (box 1: half a day, 2: 1 day, 3: 3 days, 4: 7 days, 5: 21 days) with the default difficulty, then drops `course_word_drill_states`. A seed is never a lapse. States whose word can no longer be keyed are skipped (see [`course_word_drill_states`](data-model.md#course_word_drill_states)).
- There are still no due dates, intervals, or overdue counts in the interface.
- Memory is a reference like a bookmark: it survives removing the bookmark, an author's edits, and the word's temporary removal. A row whose representative lesson is no longer visible falls back to another visible occurrence of the term, and is hidden while there is none.
- **Private.** Reviews and memory belong to one account. The learner sees them only as deck order, the end-of-session summary, and the Weak words dots; the [AI tutor](ai-tutor.md) reads them for that learner only. The superuser's [analytics](settings-and-administration.md#analytics) counts reviews per account, never which words. They create no notifications or feed activity.

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
- `PUT .../courses/:courseId/lessons/:lessonId/words/:wordId/drill/:direction` (C12) with `{ result: "got" | "again" }` records a first grade as a [review](#word-memory), updates the term's memory in the same batch, and returns `{ recent }`, the word's last five results (C14; C12 returned the box). An unknown direction or a malformed body is `400 INVALID_DRILL`; a course the viewer cannot see is `404 COURSE_NOT_FOUND`, and a word not in the lesson's published index for that course `404 WORD_NOT_FOUND`, writing nothing. It is not idempotent: each call appends a review, so the web sends one per card per session.
- `GET .../weak-words?cursor=` (C14) returns `{ items: [{ word, termKey, recent, course: { id, slug, title }, lesson: { id, slug, title } }], nextCursor, hasMemory }` (`weakWordsPageSchema` in `@wordinator/contracts/weak-words`): the [Weak words view](#weak-words-view) in order, twenty a page, `recent` being the term's last five results across both directions, oldest first. The cursor is opaque and pins the order computed at the first page's time, so pages do not shift as recall decays (`400 INVALID_CURSOR` when malformed). `hasMemory` says whether the learner has memory of any visible word, known ones included; it enables Weak words in the drill setup without bookmarks.
- `PUT .../word-memory/:termKey/known` and `DELETE` on the same path (C14) set and clear `known_override` for both directions of the viewer's memory; idempotent, returning `{ ok: true }`. `:termKey` must be a folded term key (`400 INVALID_WORD`); `PUT` on a term the viewer has no memory of is `404 WORD_NOT_FOUND`.
- `POST .../pronunciation-attempts` (C14) stores one [assessment](#pronunciation-assessment). The body (`pronunciationAttemptRequestSchema` in the contracts' `learning` subpath: `surface`, `referenceText`, `overall`, `accuracy`, `fluency`, `completeness`, `words`, and optional `termKey`, `lessonId`, and `wordId`) is validated by the contracts (scores 0–100, at most 50 word scores, reference text at most 200 characters, a lesson and word only together; otherwise `400 VALIDATION_ERROR`); a lesson and word, when given, must be in the published index of a lesson the learner can read (`404 WORD_NOT_FOUND`), and the term key is then taken from that index rather than from the body. It returns `204`. The web sends it from the recognition scope of the Words tab (`word_card`) and the drill page (`drill`), with the card's lesson and word, only when Microsoft returned an assessment, and never reads the response.
- The course words response carries each word's `lessonId` so the course recap can toggle bookmarks.
- `GET .../word-search?q=&cursor=&limit=` ([word search](#word-search)) returns `{ items: [{ word, course: { id, slug, title }, lesson: { id, slug, title } }], nextCursor }` (`wordSearchPageSchema`). `q` is 1–100 characters after trimming (`WORD_SEARCH_QUERY_MAX`), `limit` defaults to 20 and is at most 50 (`WORD_SEARCH_PAGE_MAX`); otherwise `400 INVALID_SEARCH`. A query whose key is empty returns no matches. The cursor names the last word returned (`400 INVALID_CURSOR` when malformed); a page after a word that no longer matches is empty.

Data lives in [`course_word_bookmarks`](data-model.md#course_word_bookmarks), [`word_reviews`](data-model.md#word_reviews), [`word_memory`](data-model.md#word_memory), and [`pronunciation_attempts`](data-model.md#pronunciation_attempts). C12's [`course_word_drill_states`](data-model.md#course_word_drill_states) is seeded into them and dropped by C14.
