# Lesson activities

v2 deployed to production 2026-10-21 ([ACTIVITIES_V2_PLAN.html](../ACTIVITIES_V2_PLAN.html)). This document owns section-aware lesson activities. Delivery tasks and live verification status are in [the execution plan](../LESSON_ACTIVITIES_PLAN.html). The [lesson page](courses.md#lesson-pages), [Tutor](ai-tutor.md), and [Tutor-saved practices](courses.md#ai-practices) retain their own owners.

## Scope and entry point

A lesson's activities sit in its text, after the section each comes from (below). Until 2026-10-24 the lesson's rail and New words panel also had a **Do more with AI** area that followed the section the [lesson index](courses.md#lesson-pages) marked as current; it was removed because it repeated the cards in the text, and the lesson's actions there now hold only Practise words ([courses](courses.md#lesson-box)).

### In the text

Each source's activities sit in the lesson text (approved product change, 2026-10-22), on a quiet card headed Do more with AI after the last block of the section they come from: a source runs from its heading (the introduction from the top) to the next level-1 or level-2 heading or grammar part heading. Each grammar part has its own card at the end of the part, its links marked with the part's colour dot; the lesson-end mixed practice follows the lesson's last block. The cards list every activity of their source whatever is on screen, mark completed ones Done, and keep each source's name in the links' accessible names. Behind the start gate, in draft previews, and in archived courses there are none, as there are no suggestions. Selecting an activity navigates to its own page in the same tab, with a link at the top back to the original lesson section. Suggestions require no generation. The list reads one kind of learner data: the viewer's own completed runs, which mark a suggestion **Done** with a check-only mark (the word is visually hidden for assistive technology, and a title tooltip shows it). A completion counts only while its section's source fingerprint is the current one for that activity type, so a republished section that changed is no longer done; restarting the activity clears the mark, and completing it again restores it. Other learners' runs never appear.

The feature is limited to the current lesson's content: no vocabulary activities other than a dialogue section's [review words](#review-words), no word grouping, weak-word selection, personalization, cross-lesson retrieval, two-lesson checkpoints or Tutor conversation. Ordinary words inside source sentences remain lesson content. Existing Tutor-saved and personal practices remain separate.

Attaching an activity to its source and suggesting it are one feature. Suggestions exist before cached content exists. They replaced the two generic lesson-to-Tutor prompt links of the former AI action area; Practise words stays as a separate lesson utility, and Tutor navigation is unchanged.

## Activity catalogue

| Activity | Source | Content | Completion |
| --- | --- | --- | --- |
| Review words | Dialogue section with words | A drill session of the section's vocabulary words, in the page; model-free | The drill session finished |
| Read aloud | Dialogue section | The section's dialogue lines; the learner chooses one speaker (the app voices the others) or all lines, and reads each aloud with pronunciation feedback; model-free | All the chosen lines read |
| Guided grammar | Grammar section | Ordered steps over the section's blocks, each with a choice question and feedback | All steps answered |
| Tricky grammar | Grammar section | Four choice, fill-in or word-order questions using taught distinctions | All answered |
| Mixed practice | Summary or lesson endpoint | Six questions combining this lesson's concepts | All answered |

Counts are fixed generation-recipe defaults, except guided grammar (2-12 steps) and read-aloud lines (at most 60 per section). Activities are finite, not chats.

Story comprehension, the four-question choice quiz once offered under a story section's dialogue, was retired on 2026-10-23 (approved product change): migration `0044` deleted its shared activities with their runs and answers. On 2026-10-24 (approved product change) a dialogue section was limited to two activities, [review words](#review-words) and [read aloud](#read-aloud): story summary, speak from English and the Sofia-only original-dialogue role-play were retired, and read aloud became the speaker-choice reading below. Migration `0045` deleted the retired types' shared activities and the old read-aloud content (which also read prose), with their runs and answers.

**Progress.** Answering a guided grammar step marks the lesson blocks shown in that step as read for lesson progress. The viewer's saved lesson position advances to the step key of the last shown block only if it is further than the current saved position (it never moves backwards), then the existing completion check runs. Archived courses and unsaved runs make no progress write. Word memory changes only through review words, whose drill grades words as any [drill](words.md#drill) does.

**Note on furthest-position credit.** Reading share is based on the furthest position, so this also credits earlier steps, the same as a reader scrolling ahead. The owner may revisit this; the alternative is a per-block read set, which is a larger change.

## Sources and sections

Use shared deterministic contracts to resolve sources from the published lesson. Stable heading/block IDs identify sections. Inside a grammar section, level-3 subsections are sources of their own (grammar parts); the index lists them under their level-2 section, and each has its own card in the text. Columns remain inside their owning section; empty headings alone do not create activities. Blocks before the first heading may form an introduction. Mixed practice also has a synthetic lesson-end source.

Classify from structured dialogue/callout content and the existing overview conventions. Do not call a model on scroll. Unsupported sections have no suggestions. A section (or an introduction) with dialogue lines is a dialogue section: it offers read aloud over all its dialogues, and review words first when it also has vocabulary words. Dialogues are not sources of their own.

Drafts, unpublished previews and the unpassed lesson start gate offer no activities. Finished lessons continue to follow the current viewport. The API verifies source/type eligibility itself and never trusts client-provided source text.

## Shared cached content

One content version is shared across accounts for each lesson, source and activity type. Cache identity also includes source fingerprint, language, recipe version and payload-schema version. Each version records the model that answered its generation request, after any provider fallback (`generated_by`, 2026-10-22), and the activity page shows it under the title as "Generated with *model*"; content cached before that shows "Model not recorded", and read aloud and review words, which no model writes, show neither. Generation uses the same [AI settings](ai-tutor.md#providers-and-fallback) as the tutor. Learner ID and the read-aloud reader are not cache dimensions. There is no generate-another or variant picker.

Opening triggers generation only on a miss; read aloud and review words are materialized from the published source on their first open, with no model, lease or AI allowance. The model's source contains relevant published text/headings and goal, without private notes, vocabulary blocks, learner context or progress. Mixed practice uses this lesson only.

An expiring generation lease and unique cache key prevent concurrent visitors generating multiple copies. Ready content must pass strict contracts. Recheck lease ownership and source identity before publication. Invalid, failed or stale output is never served as current. Retry recovers a failed generation under the same identity after a 30-second server backoff; it does not produce a second variant.

Relevant edits invalidate by source fingerprint. Unrelated section edits preserve content where its source is unchanged. Cast edits refresh audio identity without invalidating unchanged text. New opens resolve the current source; an owned in-progress run may finish its immutable historical version while the lesson is still readable. Unpublishing blocks access immediately. Stale versions are not purged yet: their rows stay until the lesson is deleted. A later purge may remove unreferenced stale versions and must keep any version that has private runs.

Generation uses the existing provider fallback without Tutor conversations or tools. One model-generation claim consumes one existing daily AI-turn allowance, reserved safely when the lease is taken; cache hits and deterministic materialization consume none. Existing speech limits apply separately. Cache hits remain usable without a model provider or fresh generation allowance. The preparation panel stacks the observable opening and generation steps, collapsed by default; expanding one shows the requested activity type and source section or the generation wait. It does not invent tool calls or internal progress that the status API does not report.

## Model output

For the generated types the model writes content only: summary text or questions with `prompt`, `options` (three strings), `correctIndex` (0-2), `explanation`, fill-in `referenceAnswers`, and word-order `tokens` in their correct sentence order. The model never writes IDs, a `type` or version numbers. Wordinator parses that with non-strict schemas (unknown keys are dropped), assigns every ID with `crypto.randomUUID()`, shuffles word-order tokens with a sentence-seeded permutation and derives `expectedOrder`, then validates the result with the strict payload contract. Question counts stay exact (tricky grammar 4, mixed practice 6). A reply wrapped in a Markdown fence or with prose around the JSON is accepted; anything that still fails is `ACTIVITY_OUTPUT_INVALID`, logged as `lesson_activity.output_invalid` with the type, the failure stage and the issue paths only, never the model text or lesson content.

Additional shapes: `guided_grammar` returns ordered `steps`, each with 1-4 chunk indices into the numbered grammar chunks and one choice question (`prompt`, `options`, `correctIndex`, `explanation`). The server maps indices to lesson block IDs and snapshots those blocks into the payload; the model never writes IDs. `guided_grammar` also returns `followUps`, 0-2 values from `tricky_grammar` and `mixed_practice`; the server keeps only the types eligible in this lesson. Every generated payload carries `metrics`: 1-3 keys from the enum `lesson_share`, `lesson_reading`, `lesson_grammar` and `lesson_activities`, chosen by the model, which never sees numbers. `read_aloud` and `review_words` have no model output: read aloud's lines and review words' word IDs come from the published lesson, and their metrics are the fixed default `[lesson_share]`.

## Guided grammar

`guided_grammar` replaces the earlier one-question grammar activity, which is removed everywhere. Grammar explanation was retired on 2026-10-22 (approved product change): migration `0042` deleted its shared activities with their runs and answers and dropped it from stored guided-grammar follow-ups. A grammar section offers guided grammar and `tricky_grammar`. Content is generated once, cached and shared like every activity, with no live per-learner adaptation.

- The model receives the grammar section's blocks as a numbered list of chunks and returns ordered steps. Each step has 1-4 chunk indices (prefer atomic: one sub-rule or one example group per step) and one small choice question with three options, `correctIndex` and `explanation`, that checks or continues teaching that chunk. An activity has 2-12 steps in total.
- Chunks ascend in document order across steps, should cover the section, and never overlap.
- UI: one slide per step. A step progress bar sits at the top. Below it are the step's lesson blocks, rendered with the read-only lesson renderer (`LessonBlocks`). Under those is the small question with feedback. Once the answer is checked, Continue appears.
- Answering a step applies the progress rule under [Activity catalogue](#activity-catalogue).
- Completion offers "Back to the lesson's practices": a link to the first practice block inside the source section (hash = block ID), otherwise the normal return link. The rest of the completion order is under [Completion and progress](#completion-and-progress).

## Dialogue sections

A dialogue section offers exactly two activities (approved product change, 2026-10-24): review words, when the section has vocabulary words, then read aloud. Both are model-free and shared like every activity.

### Review words

`review_words` is a [drill](words.md#drill) session of the section's words inside the activity page, with the drill's own cards, self-grading, Again, speech and saved grades.

- **Words.** The section's vocabulary words, each once, in document order, columns included (`sectionWordIds` in the contracts). The payload stores their IDs; the deck is drawn by the word-drill route with the lesson and `section` (the activity source), under the lesson drill's visibility and deck rules, so it holds at most `WORD_DRILL_SESSION_SIZE` cards in mixed direction.
- **Word memory.** Each card's first grade is written as a drill review, so review words, unlike every other activity, changes word memory. Pronunciation assessments are stored as drill attempts.
- **Completion.** The run has no answer items. When the last card is retired the page completes the run and shows the [completion](#completion-and-progress) screen instead of the drill's results; a read-only (archived) run completes nothing. Back to lesson leaves the drill, and the run stays open.

### Read aloud

`read_aloud` lines are the section's dialogue turns in document order, columns included, each with its trimmed speaker (`dialogueLines`, at most 60); prose is not read. The learner chooses whose lines to read before starting: one of the speakers, in order of first line, or **All lines** (the default for a new run).

1. The choice is the run's `reader` (null for all lines), set with the run action `set_reader`; the server accepts only a speaker the lines name, and choosing starts the reading over at the first line. Earlier answers stay with the run, but only the chosen lines count toward completion. A run that has passed its first line resumes without asking again; a new or restarted run asks, with the run's reader preselected.
2. Start enables playback. The app voices every other speaker's lines before the learner's next line, in the course cast voices, and shows them with Replay; the lines after the learner's last one follow it. With All lines nothing is voiced.
3. The learner's line is shown in Dutch with Listen. The microphone control is visible and ready: hold it with pointer, touch or a focused keyboard key to capture. Release stops capture and fills an editable, unsent transcript. Typing is always available.
4. Only **Send** submits the line. Release never submits. Duplicate submits are disabled while recognition or submission is in flight.
5. Feedback shows Correct or "Different from the original line" with the original, and supported pronunciation feedback. Retry and Listen stay available; explicit Continue advances to the next voiced lines. The last line offers Finish and the return link. A mismatch or low score never prevents continuing.

Reference matching (read-aloud lines and fill-in answers, `normalizeLessonSentence` in the contracts) ignores case, punctuation, quote style, dashes, whitespace and the established e/i accent equivalence, keeps apostrophes inside words (`z'n` is not `zn`), and never drops articles as word-card matching does. A different answer is described as different from the original line, not as incorrect Dutch.

Microsoft recognition can return reference-based pronunciation scores. Browser recognition and typed input do not manufacture scores. A line over 300 characters is split at sentence ends, then at spaces. The server serves one part per request, and the page requests every part of a line in order (up to 20) when it plays or replays that line, so no reference is truncated.

"Ready" does not mean continuously recording. Capture is active only while held, never during voiced playback. Capture stops on release, cancellation, blur, hidden tab, navigation or sign-out. A blocked microphone, unavailable recognizer or failed audio keeps typing and the return path.

## Completion and progress

Completion works the same way for every activity type.

- **Metrics.** Each metric key has a value from 0 to 1, computed server-side for the viewer. `lesson_share` is this lesson's `lessonShare` ("% of Lesson 8 done"). `lesson_reading` is the reading half of that share. `lesson_grammar` is the share of this lesson's grammar sources whose `guided_grammar` run is completed at the current fingerprint. `lesson_activities` is the share of this lesson's suggested activities completed at current fingerprints.
- **Snapshots.** When a run starts (the first open that creates it, and on restart), the server stores all metric values in the run as `metrics_before`. On completion, the response includes before and after values for the activity's requested keys.
- **Display.** The screen shows only metrics that changed, as progress bars with friendly copy, for example "+6% of this lesson's grammar" or "Lesson 8 is now 42% done (+2%)". If none changed, the block is hidden.
- **Up next**, in this order: the model's `followUps` (`guided_grammar` only); the next source's suggestions in document order (the next section's activities); Back to lesson (the existing link); Back to practices (`guided_grammar` only, see [Guided grammar](#guided-grammar)).
- **Done marks.** An Up next item the viewer has already completed (current version) shows a Done badge with when it was finished ("Done · 3 days ago"). Question activities (guided grammar, tricky grammar, mixed practice) show their first-try score instead of Done ("3/4 correct · 3 days ago"): each item's first answer counts, so later tries and restarts never raise it.

## Activity icons

Every activity type has its own lucide-react icon, on its links in the text's Do more with AI cards:

| Activity | Icon |
| --- | --- |
| Review words | `BookOpenCheck` |
| Read aloud | `Mic` |
| Guided grammar | `Footprints` |
| Tricky grammar | `Puzzle` |
| Mixed practice | `Shuffle` |

## Dedicated page and private work

The route is `/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType`. A direct URL goes through the same open/resolve flow. The top source link resolves the canonical lesson URL and source heading/block anchor. The lesson page scrolls that anchor under its sticky inset once per hash, ahead of the saved position (smooth, or instant under reduced motion); it does not do so behind the start gate, and a missing anchor leaves the normal resume position or the top. Opening a cache miss returns `generating` and the page polls the status route at the server's one-second interval; after 60 seconds it stops and offers Retry. The status route reports `failed` with `retryAfterMs` (null when no retry is scheduled). In a fill-in question, plain Enter checks the current answer, including multiword answers; Shift+Enter inserts a line break. Continuing past the last item is refused with `400`; the last item completes the activity.

While a run is not completed, a quiet **Skip this activity** link sits at the end of the page. It goes to the first Up next suggestion (the same ordering as [Completion and progress](#completion-and-progress)) that is not this activity and not already completed, or back to the lesson when none is left. It is a plain link: it saves no answer, changes no run and makes no API request, so the run stays resumable.

**Question feedback** (2026-10-22). Once a choice question is checked, its options lock; the correct one turns green (`--color-success-surface`, a `--color-success` edge) with a **Correct answer** badge on its top end corner, and a wrong pick keeps a danger edge. The question's explanation follows the options. Under it, with no box around it, a result row shows a green **Correct** badge, or "Not quite. The correct answer is marked.", at its start and Try again and Continue at its end; Continue takes focus as the row appears, so Enter moves on. Fill-in and word-order answers end in the same row; a wrong one first shows the reference answer, and the explanation follows. The correct option is the one whose text is the returned reference. Word-order questions use the shared word-order board (`WordOrderBoard`, as lesson practices and the tutor do): pieces move by tapping, by keyboard, or by dragging, including between the words already placed. Word order is graded on the sentence the chosen order builds, every piece used once, so a repeated word may come from either of its pieces.

Each account has its own resumable run per activity version. Submitted answers, retries, feedback, the read-aloud reader and completion are private. Explicit Start again reuses shared content while restarting the learner's position; attempts remain private. Answer submission is idempotent. Server grading uses stored references, which question views omit until the relevant answer is submitted. Client pronunciation scores are self-study feedback, not trusted evidence for permissions or proficiency.

Preserve unsent drafts on the device, namespaced by account, activity version, run, item and schema version. Fill-in answers keep drafts; choice, word-order and read-aloud answers do not. Sign-out preserves them, and another account cannot load them. Old drafts never silently populate changed questions. Resetting a lesson deletes that learner's runs and answers for the lesson's activities in the same batch as the rest of the [reset](courses.md#reset), while the shared activity rows remain. Deleting the lesson removes both shared activities and private work.

A readable archived course can serve ready activity content without creating shared content or durable private work; the activity shows that it is unsaved. The lesson page shows no suggestions for an archived course, but its activity URLs still work. Ordinary authentication/setup and current lesson visibility apply to every endpoint, including polling and speech. Nested IDs and run ownership are checked independently.

## Speech and privacy exception

The existing recognizers send audio directly from the browser to their service; Wordinator never stores raw learner audio. **Explicit Send of a read-aloud line sends the editable transcription as private activity answer text.** This is the narrow approved exception to the no-transcript-storage rule of drill/word-card speech; review words follows the drill's own rule and stores no transcript. Nothing is sent to another learner or placed in shared cached content.

Voiced and reference playback resolves stored read-aloud line IDs server-side, never arbitrary client text or voices. It uses the existing content-addressed R2 speech with course cast voices, by speaker name. Generated clips are intentionally public-by-URL. The speech route, long-line parts, metering and archived-course behaviour are described in [speech](speech.md#lesson-activity-read-aloud). The existing narrator-only on-demand Tutor rule is unchanged for Tutor surfaces; read aloud is a cast-based activity surface.

## Learning time

Use the one learning clock with activity `lesson_activity`, lesson/activity target and grammar or speaking focus (read aloud is speaking). Review words claims none: its drill records drill time, as any drill does. Count active work only, not generation waits, hidden/idle time or duplicate lesson/Tutor claims. Aggregate into existing AI-practice time totals and daily goals, retaining focus on stored entries. Recorded time never changes typical lesson-reading medians, required-practice medians or lesson completion; only answered guided grammar steps move lesson progress.

## API and persistence

Contracts in `@wordinator/contracts/lesson-activities` own descriptors, payloads, safe views, run/actions and answers. New endpoints are global under `/api/courses/:courseId/lessons/:lessonId/activities`; they do not introduce a new group boundary. Store immutable shared versions separately from owned runs and answer retries. The data model and exact schema are tracked in [data-model.md](data-model.md); migration identifiers and actual verification results belong to the delivery plan.

## Known gaps

- Safari may block partner audio that starts after an asynchronous fetch, because the play call is no longer inside the learner's tap. The audio-unavailable notice shows and typing still works.
- The recognizer ends a held capture on silence, so a long pause ends the transcript before release.
- Pronunciation scores are shown on the device only. They are not sent to the server and are not stored.
- Future, not planned: live adaptive generation; a per-block read set for progress.

## Verification

Mandatory negative tests cover signed-out/setup-incomplete accounts, hidden/unpublished lessons, mismatched nested IDs, cross-account runs and reference stripping. Cache tests cover duplicate opens, source changes during generation, stale leases and retries. Flow tests cover current-section suggestions, dedicated navigation/resume, the read-aloud reader choice and voiced lines, explicit Send, microphone cleanup and typed fallback, and the review-words drill of the section's words. Learning/reset tests prove that no activity but review words changes word memory, that recorded time changes no medians or completion, and that progress moves only through answered guided grammar steps, with no write for archived or unsaved runs. See [testing](testing.md) and the execution plan for actual commands and results.
