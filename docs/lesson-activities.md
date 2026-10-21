# Lesson activities

Approved 2026-10-21; implementation in progress. This document owns section-aware lesson activities. Delivery tasks and live verification status are in [the execution plan](../LESSON_ACTIVITIES_PLAN.html). The [lesson page](courses.md#lesson-pages), [Tutor](ai-tutor.md), and [Tutor-saved practices](courses.md#ai-practices) retain their own owners.

## Scope and entry point

The lesson's existing **Do more with AI** area suggests activities for the section at the reading line. Selecting an activity navigates to its own page in the same tab, with a link at the top back to the original lesson section. Scrolling backwards restores that section's suggestions. Suggestions require no generation or learner-history lookup.

The feature is limited to the current lesson's content: no vocabulary activities, word grouping, weak-word selection, personalization, cross-lesson retrieval, two-lesson checkpoints or Tutor conversation. Ordinary words inside source sentences remain lesson content. Existing Tutor-saved and personal practices remain separate.

Attaching an activity to its source and suggesting it are one feature. Suggestions exist before cached content exists. Replace the two generic lesson-to-Tutor prompt links in the AI action area; retain Practise words as a separate lesson utility and keep Tutor navigation unchanged. Existing responsive footer/drawer placement applies.

## Activity catalogue

| Activity | Source | Content | Completion |
| --- | --- | --- | --- |
| Story summary | Story section | Short English scene explanation and Dutch recap | Explicit Done |
| Story comprehension | Story section | Four questions, three choices each, feedback | All answered |
| Grammar explanation | Small grammar section | English explanation, Dutch examples and translations | Explicit Done |
| Quick grammar | Small grammar section | One question with three choices and feedback | Answer checked |
| Tricky grammar | Small grammar section | Four choice, fill-in or word-order questions using taught distinctions | All answered |
| Mixed practice | Summary or lesson endpoint | Six questions combining this lesson's concepts | All answered |
| Role-play | Original dialogue containing Sofia and a partner | Original dialogue; learner produces Sofia's lines | All Sofia turns sent |

Counts are fixed generation-recipe defaults. Activities are finite, not chats. Text is escaped plain text with line breaks and safe links; structured explanation components do not extend lesson rich text to other surfaces. Required lesson completion, required practice progress and word memory never change through activities.

## Sources and sections

Use shared deterministic contracts to resolve sources from the published lesson. Stable heading/block IDs identify sections. Level-3 grammar subsections can be sources independently of the index's coarser level-1/2 highlight. Columns remain inside their owning section; empty headings alone do not create activities. Blocks before the first heading may form an introduction. Mixed practice also has a synthetic lesson-end source.

Classify from structured dialogue/callout content and the existing overview conventions. Do not call a model on scroll. Unsupported sections have no suggestions. Each original dialogue is its own role-play source when several occur in one section; offer it only when the trimmed, case-insensitive speaker list contains Sofia and another character. Never substitute another learner role silently.

Drafts, unpublished previews and the unpassed lesson start gate offer no activities. Finished lessons continue to follow the current viewport. The API verifies source/type eligibility itself and never trusts client-provided source text.

## Shared cached content

One content version is shared across accounts for each lesson, source and activity type. Cache identity also includes source fingerprint, language, recipe version and payload-schema version. Learner ID and cue mode are not cache dimensions. There is no generate-another or variant picker.

Opening triggers generation only on a miss. The source contains relevant published text/headings and goal, without private notes, vocabulary blocks, learner context or progress. Mixed practice uses this lesson only. English role-play cues use existing translations when available and are otherwise generated once without rewriting Dutch lines. Complete original dialogues can be materialized without a model call.

An expiring generation lease and unique cache key prevent concurrent visitors generating multiple copies. Ready content must pass strict contracts. Recheck lease ownership and source identity before publication. Invalid, failed or stale output is never served as current. Retry recovers a failed generation under the same identity after server backoff; it does not produce a second variant.

Relevant edits invalidate by source fingerprint. Unrelated section edits preserve content where its source is unchanged. Cast edits refresh audio identity without invalidating unchanged text. New opens resolve the current source; an owned in-progress run may finish its immutable historical version while the lesson is still readable. Unpublishing blocks access immediately. Unreferenced stale content can be purged; referenced versions stay until their private runs are removed.

Generation uses the existing provider fallback without Tutor conversations or tools. One model-generation claim consumes one existing daily AI-turn allowance, reserved safely when the lease is taken; cache hits and deterministic materialization consume none. Existing speech limits apply separately. Cache hits remain usable without a model provider or fresh generation allowance.

## Dedicated page and private work

The route is `/courses/$courseSlug/lessons/$lessonSlug/activities/$sourceId/$activityType`. A direct URL goes through the same open/resolve flow. The top source link resolves the canonical lesson URL and source heading/block anchor; if it was removed, return to lesson top.

Each account has its own resumable run per activity version. Submitted answers, retries, feedback, cue choice and completion are private. Explicit Start again reuses shared content while restarting the learner's position; attempts remain private. Answer submission is idempotent. Server grading uses stored references, which question views omit until the relevant answer is submitted. Client pronunciation scores are self-study feedback, not trusted evidence for permissions or proficiency.

Preserve unsent drafts on the device, namespaced by account, activity version, run, item and schema version. Sign-out preserves them, and another account cannot load them. Old drafts never silently populate changed questions. Resetting a lesson removes only that learner's activity work, while shared content remains. Deleting the lesson removes both shared activities and private work.

A readable archived course can serve ready activity content without creating shared content or durable private work; the activity shows that it is unsaved. Ordinary authentication/setup and current lesson visibility apply to every endpoint, including polling and speech. Nested IDs and run ownership are checked independently.

## Original-dialogue role-play

The learner plays Sofia and the app voices the other original characters in the existing course cast. Dialogue turn order and Dutch reference sentences stay unchanged. No partner reply is generated live.

1. Start explicitly to enable playback. Play partner turns until Sofia is next, or begin with Sofia if she opens the scene.
2. Let the learner switch between the English translation and the exact Dutch line, including during a turn. English mode can reveal the Dutch reference.
3. Keep the microphone control visible and ready. Hold it with pointer, touch or a focused keyboard key to capture the utterance. Release stops capture and produces an editable, unsent transcript. Typing is always available.
4. Only **Send** submits Sofia's line. Release never submits. Disable duplicate submits while recognition or submission is in flight.
5. Show original-line comparison and supported pronunciation feedback. Offer Retry and Listen to Sofia; explicit Continue advances to the next partner turn. The last turn offers Finish and the return link. Mismatch or low scores never prevent continuing.

Reference matching ignores case, punctuation, whitespace and the established accent equivalence, but never drops articles as word-card matching does. A different answer is described as different from Sofia's line, not automatically as incorrect Dutch. This is practice generating and reproducing the original line, not open-ended conversational grading.

Microsoft recognition can return reference-based pronunciation scores. Browser recognition and typed input do not manufacture scores. Long lines use explicit sentence/chunk handling within validated limits; no reference is silently truncated. The complete Sofia turn still needs Send.

“Ready” does not mean continuously recording. Capture is active only while held, never during partner playback. Stop/release capture on cancellation, blur, hidden tab, navigation or sign-out. A blocked microphone, unavailable recognizer or failed audio must preserve typing and the return path.

## Speech and privacy exception

The existing recognizers send audio directly from the browser to their service; Wordinator never stores raw learner audio. **Explicit Send sends the editable transcription as private activity answer text.** This is the narrow approved exception to the no-transcript-storage rule of drill/word-card speech. Nothing is sent to another learner or placed in shared cached content.

Partner and reference playback resolves original stored turn IDs server-side, never arbitrary client text or voices. Use existing content-addressed R2 speech with course cast voices. Generated clips are intentionally public-by-URL. The existing narrator-only on-demand Tutor rule is unchanged for Tutor surfaces; role-play adds a cast-based activity surface.

## Learning time

Use the one learning clock with activity `lesson_activity`, lesson/activity target and reading, grammar or speaking focus. Count active work only, not generation waits, hidden/idle time or duplicate lesson/Tutor claims. Aggregate into existing AI-practice time totals and daily goals, retaining focus on stored entries. Do not change typical lesson-reading medians, required-practice medians or lesson completion.

## API and persistence

Contracts in `@wordinator/contracts/lesson-activities` own descriptors, payloads, safe views, run/actions and answers. New endpoints are global under `/api/courses/:courseId/lessons/:lessonId/activities`; they do not introduce a new group boundary. Store immutable shared versions separately from owned runs and answer retries. The data model and exact schema are tracked in [data-model.md](data-model.md); migration identifiers and actual verification results belong to the delivery plan.

## Verification

Mandatory negative tests cover signed-out/setup-incomplete accounts, hidden/unpublished lessons, mismatched nested IDs, cross-account runs and reference stripping. Cache tests cover duplicate opens, source changes during generation, stale leases and retries. Flow tests cover current-section suggestions, dedicated navigation/resume, cue modes, explicit Send, microphone cleanup and typed fallback. Learning/reset tests prove that no required progress or word memory is changed. See [testing](testing.md) and the execution plan for actual commands and results.
