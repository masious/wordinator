# Lesson activities

v2 deployed to production 2026-10-21 ([ACTIVITIES_V2_PLAN.html](../ACTIVITIES_V2_PLAN.html)). This document owns section-aware lesson activities. Delivery tasks and live verification status are in [the execution plan](../LESSON_ACTIVITIES_PLAN.html). The [lesson page](courses.md#lesson-pages), [Tutor](ai-tutor.md), and [Tutor-saved practices](courses.md#ai-practices) retain their own owners.

## Scope and entry point

The lesson's existing **Do more with AI** area suggests activities for the section at the reading line. Selecting an activity navigates to its own page in the same tab, with a link at the top back to the original lesson section. Scrolling backwards restores that section's suggestions. Suggestions require no generation. The list reads one kind of learner data: the viewer's own completed runs, which mark a suggestion **Done** with a check-only mark (the word is visually hidden for assistive technology, and a title tooltip shows it). A completion counts only while its section's source fingerprint is the current one for that activity type, so a republished section that changed is no longer done; restarting the activity clears the mark, and completing it again restores it. Other learners' runs never appear.

The feature is limited to the current lesson's content: no vocabulary activities, word grouping, weak-word selection, personalization, cross-lesson retrieval, two-lesson checkpoints or Tutor conversation. Ordinary words inside source sentences remain lesson content. Existing Tutor-saved and personal practices remain separate.

Attaching an activity to its source and suggesting it are one feature. Suggestions exist before cached content exists. Replace the two generic lesson-to-Tutor prompt links in the AI action area; retain Practise words as a separate lesson utility and keep Tutor navigation unchanged. Existing responsive footer/drawer placement applies.

## Activity catalogue

| Activity | Source | Content | Completion |
| --- | --- | --- | --- |
| Story summary | Story section | Short English scene explanation and Dutch recap | Explicit Done |
| Story comprehension | Story section | Four questions, three choices each, feedback | All answered |
| Read aloud | Story section | Each Dutch line to read aloud, with pronunciation feedback; model-free | All lines read |
| Speak from English | Story section | English line for each Dutch line; learner produces the Dutch line | All lines sent |
| Grammar explanation | Grammar section | English explanation, Dutch examples and translations | Explicit Done |
| Guided grammar | Grammar section | Ordered steps over the section's blocks, each with a choice question and feedback | All steps answered |
| Tricky grammar | Grammar section | Four choice, fill-in or word-order questions using taught distinctions | All answered |
| Mixed practice | Summary or lesson endpoint | Six questions combining this lesson's concepts | All answered |
| Role-play | Original dialogue containing Sofia and a partner | Original dialogue; learner produces Sofia's lines | All Sofia turns sent |

Counts are fixed generation-recipe defaults, except guided grammar (2-12 steps) and speaking lines (at most 60 per section). Activities are finite, not chats.

**Progress.** Answering a guided grammar step marks the lesson blocks shown in that step as read for lesson progress. The viewer's saved lesson position advances to the step key of the last shown block only if it is further than the current saved position (it never moves backwards), then the existing completion check runs. Archived courses and unsaved runs make no progress write. Word memory never changes through activities.

**Note on furthest-position credit.** Reading share is based on the furthest position, so this also credits earlier steps, the same as a reader scrolling ahead. The owner may revisit this; the alternative is a per-block read set, which is a larger change.

## Sources and sections

Use shared deterministic contracts to resolve sources from the published lesson. Stable heading/block IDs identify sections. Inside a grammar section, level-3 subsections can be sources independently of the index's coarser level-1/2 highlight. Columns remain inside their owning section; empty headings alone do not create activities. Blocks before the first heading may form an introduction. Mixed practice also has a synthetic lesson-end source.

Classify from structured dialogue/callout content and the existing overview conventions. Do not call a model on scroll. Unsupported sections have no suggestions. Each original dialogue is its own role-play source when several occur in one section; offer it only when the trimmed, case-insensitive speaker list contains Sofia and another character. Never substitute another learner role silently.

Drafts, unpublished previews and the unpassed lesson start gate offer no activities. Finished lessons continue to follow the current viewport. The API verifies source/type eligibility itself and never trusts client-provided source text.

## Shared cached content

One content version is shared across accounts for each lesson, source and activity type. Cache identity also includes source fingerprint, language, recipe version and payload-schema version. Learner ID and cue mode are not cache dimensions. There is no generate-another or variant picker.

Opening triggers generation only on a miss. The source contains relevant published text/headings and goal, without private notes, vocabulary blocks, learner context or progress. Mixed practice uses this lesson only. For role-play the server derives every turn's speaker, order, Sofia flag, Dutch reference text and turn ID from the lesson, and the model supplies only English translations and cues matched by position, so a model reply cannot change the Dutch lines, speakers or order; dialogue blocks store no translations yet, so each role-play takes one generation, and a stored translation would later allow a model-free materialization.

An expiring generation lease and unique cache key prevent concurrent visitors generating multiple copies. Ready content must pass strict contracts. Recheck lease ownership and source identity before publication. Invalid, failed or stale output is never served as current. Retry recovers a failed generation under the same identity after a 30-second server backoff; it does not produce a second variant.

Relevant edits invalidate by source fingerprint. Unrelated section edits preserve content where its source is unchanged. Cast edits refresh audio identity without invalidating unchanged text. New opens resolve the current source; an owned in-progress run may finish its immutable historical version while the lesson is still readable. Unpublishing blocks access immediately. Stale versions are not purged yet: their rows stay until the lesson is deleted. A later purge may remove unreferenced stale versions and must keep any version that has private runs.

Generation uses the existing provider fallback without Tutor conversations or tools. One model-generation claim consumes one existing daily AI-turn allowance, reserved safely when the lease is taken; cache hits and deterministic materialization consume none. Existing speech limits apply separately. Cache hits remain usable without a model provider or fresh generation allowance. The preparation panel stacks the observable opening and generation steps, collapsed by default; expanding one shows the requested activity type and source section or the generation wait. It does not invent tool calls or internal progress that the status API does not report.

## Model output

For the non-role-play types the model writes content only: summary text, explanation paragraphs and examples, or questions with `prompt`, `options` (three strings), `correctIndex` (0-2), `explanation`, fill-in `referenceAnswers`, and word-order `tokens` in their correct sentence order. The model never writes IDs, a `type` or version numbers. Wordinator parses that with non-strict schemas (unknown keys are dropped), assigns every ID with `crypto.randomUUID()`, shuffles word-order tokens with a sentence-seeded permutation and derives `expectedOrder`, then validates the result with the strict payload contract. Question counts stay exact (story comprehension 4, tricky grammar 4, mixed practice 6). A reply wrapped in a Markdown fence or with prose around the JSON is accepted; anything that still fails is `ACTIVITY_OUTPUT_INVALID`. Outside role-play it is logged as `lesson_activity.output_invalid` with the type, the failure stage and the issue paths only, never the model text or lesson content; role-play failures return the same error without that log line. Role-play keeps its own contract above.

Additional shapes: `story_summary` returns sentence pairs (each Dutch sentence with its English translation, in order) and `newWords`, the other section words the lesson does not teach. The model receives the lesson's own terms as already taught (see [Story summary](#story-summary)). `guided_grammar` returns ordered `steps`, each with 1-4 chunk indices into the numbered grammar chunks and one choice question (`prompt`, `options`, `correctIndex`, `explanation`). The server maps indices to lesson block IDs and snapshots those blocks into the payload; the model never writes IDs. `guided_grammar` also returns `followUps`, 0-2 values from `tricky_grammar`, `mixed_practice` and `grammar_explanation`; the server keeps only the types eligible in this lesson. Every generated payload carries `metrics`: 1-3 keys from the enum `lesson_share`, `lesson_reading`, `lesson_grammar` and `lesson_activities`, chosen by the model, which never sees numbers. `read_aloud` has no model output: its lines come from the published lesson and its metrics are the fixed default `[lesson_share]`.

## Story summary

The recap shows Dutch sentences with their English translations. Hovering or focusing a Dutch sentence highlights its English pair, and the reverse. The section's image (the first image block in the section, including inside columns), when present, appears at the top of the activity. On completion, the activity suggests "understand grammar": the next section's grammar activity, when a next grammar section exists.

- **Word dictionary.** A left-side list of new words used in this section that the lesson does not already teach. It reuses the visual UI of the lesson's new-words panel (`LessonWords`). Display only: no bookmarking and no word-memory change.
- **Newly listed words.** The lesson's own word list (`collectLessonWords` terms) goes to the model as already taught. The model decides which other section words to return in `newWords`. Validation is shape-only under the strict contract; the server only dedupes case-insensitively within the list and against the lesson's terms.

## Guided grammar

`guided_grammar` replaces the earlier one-question grammar activity, which is removed everywhere. `grammar_explanation` and `tricky_grammar` are unchanged. Content is generated once, cached and shared like every activity, with no live per-learner adaptation.

- The model receives the grammar section's blocks as a numbered list of chunks and returns ordered steps. Each step has 1-4 chunk indices (prefer atomic: one sub-rule or one example group per step) and one small choice question with three options, `correctIndex` and `explanation`, that checks or continues teaching that chunk. An activity has 2-12 steps in total.
- Chunks ascend in document order across steps, should cover the section, and never overlap.
- UI: one slide per step. A step progress bar sits at the top. Below it are the step's lesson blocks, rendered with the read-only lesson renderer (`LessonBlocks`). Under those is the small question with feedback. Once the answer is checked, Continue appears.
- Answering a step applies the progress rule under [Activity catalogue](#activity-catalogue).
- Completion offers "Back to the lesson's practices": a link to the first practice block inside the source section (hash = block ID), otherwise the normal return link. The rest of the completion order is under [Completion and progress](#completion-and-progress).

## Speaking activities

`read_aloud` and `speak_from_english` are two new, separate activity types. Role-play stays unchanged.

- `read_aloud`: the learner reads each Dutch line aloud and gets pronunciation feedback. It is model-free: the lines come from the published lesson.
- `speak_from_english`: the learner sees the English line and produces the Dutch line. English translations are model-written by position, in the same contract style as role-play cues. The Dutch reference stays server-derived.
- Both use story sections (the sections that get `story_summary`). Lines are the section's dialogue turns (speaker kept) and its prose text split into sentences (speaker `null`), at most 60 lines.
- Out of scope: a hint or self-navigation mode for speaking from English, and any merge with role-play.

## Completion and progress

Completion works the same way for every activity type.

- **Metrics.** Each metric key has a value from 0 to 1, computed server-side for the viewer. `lesson_share` is this lesson's `lessonShare` ("% of Lesson 8 done"). `lesson_reading` is the reading half of that share. `lesson_grammar` is the share of this lesson's grammar sources whose `guided_grammar` run is completed at the current fingerprint. `lesson_activities` is the share of this lesson's suggested activities completed at current fingerprints.
- **Snapshots.** When a run starts (the first open that creates it, and on restart), the server stores all metric values in the run as `metrics_before`. On completion, the response includes before and after values for the activity's requested keys.
- **Display.** The screen shows only metrics that changed, as progress bars with friendly copy, for example "+6% of this lesson's grammar" or "Lesson 8 is now 42% done (+2%)". If none changed, the block is hidden.
- **Up next**, in this order: the model's `followUps` (`guided_grammar` only); the next source's suggestions in document order (the next section's activities); Back to lesson (the existing link); Back to practices (`guided_grammar` only, see [Guided grammar](#guided-grammar)).
- **Done marks.** An Up next item the viewer has already completed (current version) shows a Done badge with when it was finished ("Done · 3 days ago"). Question activities (story comprehension, guided grammar, tricky grammar, mixed practice) show their first-try score instead of Done ("3/4 correct · 3 days ago"): each item's first answer counts, so later tries and restarts never raise it.

## Do more with AI

The lesson's **Do more with AI** header shows a badge with the count of this lesson's completed activities, taken from the existing completed list. The area expands upward to a taller size, and the new-words panel shrinks vertically to make room. Every activity type has its own lucide-react icon:

| Activity | Icon |
| --- | --- |
| Story summary | `BookOpenText` |
| Story comprehension | `ListChecks` |
| Grammar explanation | `NotebookPen` |
| Guided grammar | `Footprints` |
| Tricky grammar | `Puzzle` |
| Mixed practice | `Shuffle` |
| Role-play | `Drama` |
| Read aloud | `Mic` |
| Speak from English | `Languages` |

## Dedicated page and private work

The route is `/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType`. A direct URL goes through the same open/resolve flow. The top source link resolves the canonical lesson URL and source heading/block anchor. The lesson page scrolls that anchor under its sticky inset once per hash, ahead of the saved position (smooth, or instant under reduced motion); it does not do so behind the start gate, and a missing anchor leaves the normal resume position or the top. Opening a cache miss returns `generating` and the page polls the status route at the server's one-second interval; after 60 seconds it stops and offers Retry. The status route reports `failed` with `retryAfterMs` (null when no retry is scheduled). In a fill-in question, plain Enter checks the current answer, including multiword answers; Shift+Enter inserts a line break. Continuing past the last item is refused with `400`; the last item completes the activity.

Each account has its own resumable run per activity version. Submitted answers, retries, feedback, cue choice and completion are private. Explicit Start again reuses shared content while restarting the learner's position; attempts remain private. Answer submission is idempotent. Server grading uses stored references, which question views omit until the relevant answer is submitted. Client pronunciation scores are self-study feedback, not trusted evidence for permissions or proficiency.

Preserve unsent drafts on the device, namespaced by account, activity version, run, item and schema version. Fill-in answers and Sofia's role-play lines keep drafts; choice, word-order, read-aloud and speak-from-English answers do not. Sign-out preserves them, and another account cannot load them. Old drafts never silently populate changed questions. Resetting a lesson deletes that learner's runs and answers for the lesson's activities in the same batch as the rest of the [reset](courses.md#reset), while the shared activity rows remain. Deleting the lesson removes both shared activities and private work.

A readable archived course can serve ready activity content without creating shared content or durable private work; the activity shows that it is unsaved. The lesson page shows no suggestions for an archived course, but its activity URLs still work. Ordinary authentication/setup and current lesson visibility apply to every endpoint, including polling and speech. Nested IDs and run ownership are checked independently.

## Original-dialogue role-play

The learner plays Sofia and the app voices the other original characters in the existing course cast. Dialogue turn order and Dutch reference sentences stay unchanged. No partner reply is generated live.

1. Start explicitly to enable playback. Play partner turns until Sofia is next, or begin with Sofia if she opens the scene.
2. Let the learner switch between the English translation and the exact Dutch line, including during a turn. English mode can reveal the Dutch reference.
3. Keep the microphone control visible and ready. Hold it with pointer, touch or a focused keyboard key to capture the utterance. Release stops capture and produces an editable, unsent transcript. Typing is always available.
4. Only **Send** submits Sofia's line. Release never submits. Disable duplicate submits while recognition or submission is in flight.
5. Show original-line comparison and supported pronunciation feedback. Offer Retry and Listen to Sofia; explicit Continue advances to the next partner turn. The last turn offers Finish and the return link. Mismatch or low scores never prevent continuing.

Reference matching (role-play lines and fill-in answers, `normalizeLessonSentence` in the contracts) ignores case, punctuation, quote style, dashes, whitespace and the established e/i accent equivalence, keeps apostrophes inside words (`z'n` is not `zn`), and never drops articles as word-card matching does. A different answer is described as different from Sofia's line, not automatically as incorrect Dutch. This is practice generating and reproducing the original line, not open-ended conversational grading.

Microsoft recognition can return reference-based pronunciation scores. Browser recognition and typed input do not manufacture scores. A line over 300 characters is split at sentence ends, then at spaces. The server serves one part per request, and the page requests every part of a line in order (up to 20) when it plays or replays that line, so no reference is truncated. The complete Sofia turn still needs Send.

“Ready” does not mean continuously recording. Capture is active only while held, never during partner playback. Stop/release capture on cancellation, blur, hidden tab, navigation or sign-out. A blocked microphone, unavailable recognizer or failed audio must preserve typing and the return path.

## Speech and privacy exception

The existing recognizers send audio directly from the browser to their service; Wordinator never stores raw learner audio. **Explicit Send sends the editable transcription as private activity answer text.** This is the narrow approved exception to the no-transcript-storage rule of drill/word-card speech. The same exception covers `read_aloud` and `speak_from_english` transcripts, which are private answer text in the same way. Nothing is sent to another learner or placed in shared cached content.

Partner and reference playback resolves original stored turn IDs server-side, never arbitrary client text or voices. Use existing content-addressed R2 speech with course cast voices. Generated clips are intentionally public-by-URL. The speech route, long-line parts, metering and archived-course behaviour are described in [speech](speech.md#lesson-activity-role-play). The existing narrator-only on-demand Tutor rule is unchanged for Tutor surfaces; role-play adds a cast-based activity surface.

## Learning time

Use the one learning clock with activity `lesson_activity`, lesson/activity target and reading, grammar or speaking focus. Count active work only, not generation waits, hidden/idle time or duplicate lesson/Tutor claims. Aggregate into existing AI-practice time totals and daily goals, retaining focus on stored entries. Recorded time never changes typical lesson-reading medians, required-practice medians or lesson completion; only answered guided grammar steps move lesson progress.

## API and persistence

Contracts in `@wordinator/contracts/lesson-activities` own descriptors, payloads, safe views, run/actions and answers. New endpoints are global under `/api/courses/:courseId/lessons/:lessonId/activities`; they do not introduce a new group boundary. Store immutable shared versions separately from owned runs and answer retries. The data model and exact schema are tracked in [data-model.md](data-model.md); migration identifiers and actual verification results belong to the delivery plan.

## Known gaps

- Safari may block partner audio that starts after an asynchronous fetch, because the play call is no longer inside the learner's tap. The audio-unavailable notice shows and typing still works.
- The recognizer ends a held capture on silence, so a long pause ends the transcript before release.
- Pronunciation scores are shown on the device only. They are not sent to the server and are not stored.
- Future, not in v2: a hint or self-navigation mode for speaking from English; merging role-play into the speaking types; vocabulary and word-memory effects; live adaptive generation; a per-block read set for progress.

## Verification

Mandatory negative tests cover signed-out/setup-incomplete accounts, hidden/unpublished lessons, mismatched nested IDs, cross-account runs and reference stripping. Cache tests cover duplicate opens, source changes during generation, stale leases and retries. Flow tests cover current-section suggestions, dedicated navigation/resume, cue modes, explicit Send, microphone cleanup and typed fallback. Learning/reset tests prove that word memory is never changed, that recorded time changes no medians or completion, and that progress moves only through answered guided grammar steps, with no write for archived or unsaved runs. See [testing](testing.md) and the execution plan for actual commands and results.
