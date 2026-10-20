# Learning time

Approved product change (C15, 2026-10-20). Wordinator measures how long each learner actively spends reading lessons, answering practices, drilling and browsing words, and working with the AI tutor. Each learner sees their own time; every lesson and practice shows how long learners typically take; the home page summarises the learner's week or month by category against a daily goal they set.

This document owns what is measured, the clock, how time reaches the server, the lesson and practice medians, activity categories, the daily goal and streak, and the planned home dashboard. Storage is in [data model](data-model.md#learning_time); the privacy exception for medians is in [security and privacy](security-and-privacy.md#learning-data).

## What is measured

Each measured second belongs to one **activity**. Rows are kept per account, local day, and target.

| Activity | Where the clock runs | Target | Focus |
| --- | --- | --- | --- |
| `reading` | A published [lesson page](courses.md#lesson-pages), outside every practice and AI practice | course, lesson | `grammar` or `lesson` |
| `practice` | A lesson practice's answer set: the lesson page's Answer dialog and [Practice again](courses.md#lesson-actions) | course, lesson, practice block | none |
| `ai_practice` | An expanded [AI practice](courses.md#ai-practices) on the lesson page, while the learner works inside it | course, lesson, AI practice | the practice's focus |
| `tutor` | An open [tutor](ai-tutor.md) conversation at `/ai` | none | none |
| `drill` | A [drill](words.md#drill) at `/words/drill` | the course for a course drill, otherwise none | none |
| `words` | The [Words tab](words.md) at `/words` | none | none |

- **Reading focus.** Reading time is `grammar` while the lesson section at the [reading line](courses.md#lesson-positions) (from one heading to the next) holds a grammar callout or a column layout, the same rule the lesson overview uses for its Grammar stop. Otherwise it is `lesson`.
- **AI practice focus.** Every AI practice has a focus: `grammar`, `vocabulary`, `reading`, `listening`, or `writing`. The tutor chooses it when it saves the practice (`save_ai_practice`, [AI tutor](ai-tutor.md#tools)). Practices saved before C15 get one from their kind: dictation is listening; translate and choice are vocabulary; every other kind is grammar. AI practice time counts as AI practice and keeps its focus, so activity can show both the total and its breakdown.
- Previews, drafts, and unpublished lessons record nothing. Archived courses record time as long as the learner can read them.

## The clock

- Time counts only while the page is visible, the window has focus, and the learner has interacted in the last 90 seconds (`IDLE_MS`): a scroll, wheel, key, pointer, or touch, or typing in a field. Each idle gap stops the clock at the last interaction, so a tab left open adds at most 90 seconds.
- **Reading starts at the lesson.** A lesson behind the [start gate](courses.md#lesson-pages) starts its reading clock when the learner presses Start reading this lesson. A lesson that opens whole (started or finished) starts it the first time the reader's own scrolling (as defined for [lesson positions](courses.md#lesson-positions)) brings the first lesson block to the reading line. Time on the cover and header before that is not counted. After that the reading clock runs whenever the page is active.
- Opening a practice's Answer dialog pauses reading and runs that practice's clock until the dialog closes. Working inside an expanded AI practice (focus or pointer inside it) runs its clock instead of reading.
- Only one clock runs at a time. Changing route stops the clock and sends what it has.

## Sending time

- The browser adds seconds up per entry (activity, focus, course, lesson, practice) and per local day (`YYYY-MM-DD` in the browser's time zone), splitting at midnight. Once a minute, on route change, and when the page is hidden (`keepalive`), it sends what it has to `POST /api/groups/:groupId/learning-time` (the library path, like the other learning routes) (`learningTimeRequestSchema` in `@wordinator/contracts/learning`): a day and at most 20 entries of 1–600 seconds each. A failed send keeps its seconds for the next one. Nothing is stored in browser storage, so seconds still unsent when the browser closes are lost.
- The API accepts a day within one day of its own UTC date. It checks that the learner can read each course and lesson, that a practice block is a practice of that lesson's published document, and that an AI practice is tagged to that lesson and readable by the learner; it refuses the whole request otherwise (`400 VALIDATION_ERROR` for a day outside that window or a malformed entry, `404 LEARNING_TARGET_NOT_FOUND` for an unreadable target). It answers `204`. An AI practice's focus is read from the practice, never taken from the request. It then limits the request's total to the time since the account's previous accepted send (600 seconds for the first one) and scales entries down proportionally when the total is over. A client cannot record more time than has passed.
- Displays refresh once a minute from the server total plus the seconds not yet sent; nothing ticks every second.

## Lesson and practice times

The [lesson box](courses.md#lesson-box) shows the viewer's own **Reading** time (all `reading` time in the lesson) and **Practice** time (`practice` plus `ai_practice`) in whole minutes, and, once anyone has data, the **typical** times below with the number of learners behind them. Own time counts as data under the lesson box's rule that the section appears only once the viewer has studied the lesson.

- **Typical reading** is the median, over every learner who has completed the lesson (the viewer included), of their reading time up to their first completion. That time is saved on the completion (`reading_seconds`), so rereading a finished lesson adds to the learner's own total but not to the median. A completion with no recorded time, such as one from before C15, is left out.
- **Typical practice time of a practice** is the median, over every learner who has finished that practice, of their `practice` time in it up to the save that finished it (`done_seconds` on their [practice progress](courses.md#practice-answers)). A lesson's typical practice time is the sum of its practices' medians. AI practices have no median: few learners answer the same one.
- The course page's lesson list shows each lesson's typical total (reading plus practice) as `about 20 min`, and the Practice again list shows each practice's typical time.
- Medians come from `GET .../lessons/:lessonId/metrics` (the lesson box) and the course read (lesson list and Practice again), computed at read time, rounded to whole minutes, and shown only with at least one learner. They include no account IDs or individual times.
- Lessons and practices edited after people finished them keep their earlier times. No version is recorded.

## Activity

`GET /api/groups/:groupId/learning-activity?range=week|month&end=YYYY-MM-DD` returns the viewer's time per local day for the seven or thirty days ending on `end`, by category, with the previous period's total for comparison, the daily goal, and the streak. **Categories**:

| Category | Activities |
| --- | --- |
| Lesson reading | `reading` with focus `lesson` |
| Grammar | `reading` with focus `grammar` |
| Practice | `practice` |
| Vocabulary | `drill`, `words` |
| AI practice | `ai_practice` and `tutor`, with `ai_practice` broken down by focus |

## Daily goal and streak

- Settings has a **Study goal**: minutes per day, from 5 to 240, or none (the default). It is stored on the [tutor profile](ai-tutor.md#tutor-profile) row (`daily_goal_minutes`) and saved with `PUT /api/learning/goal`.
- A day meets the goal when the learner's time that local day reaches it. Without a goal, any minute of study meets the day.
- The **streak** is the number of consecutive days that met it, ending today, or ending yesterday while today has not met it yet.
- The goal and streak are personal. They are never shown to anyone else, compared, ranked, or rewarded, and nothing nags a learner who misses a day.

## Home dashboard

Planned (C15e). The signed-in home page becomes a study summary above the course library. It uses existing design tokens only, adds no colours, and follows the existing light and dark themes.

- A header with today's date as an eyebrow, a greeting with the learner's display name, and a short calm line. **Practice with AI** sits on the right and opens `/ai`.
- A wide **Continue** card. It shows a streak chip, a heading, and a line about today's goal ("One lesson away from today's goal"). It has a ring with today's share of the daily goal (or minutes studied today when there is no goal) and **Continue lesson**, which opens the most recent in-progress lesson at its saved step.
- An **Activity** card. It has the period total (`4h 20m`), its change against the previous period (`+18%`), a Week / Month switch, and a bar per day split by category, with today highlighted and a category legend. Hovering or focusing a bar shows its day's categories.
- Below `48em` the cards stack, and the activity bars stay one row with scaled labels.

## Analytics

The superuser's [analytics](settings-and-administration.md#analytics) adds a Time section: minutes per day and per account, by category. It shows counts only, like the other sections.

## Reset and deletion

- A lesson [reset](courses.md#reset) deletes the learner's `reading`, `practice`, and `ai_practice` time for the lesson. Their completion and practice progress go with it, and so do the saved snapshots.
- Lesson deletion deletes every account's time for the lesson. Course rows cascade the same way.
- Time recorded for a practice block that is later removed from the lesson stays, and still counts toward the lesson's practice time.

## Verification

- Contracts: the time request's day format, entry count, second limits, focus by activity, and target shape for each activity.
- Workers integration: authentication; visibility refusals for an unpublished lesson, a practice of another lesson, and an AI practice of another lesson; the elapsed-time clamp; the day window; upserts adding seconds; completion and done snapshots; medians across accounts including the viewer; reset and lesson deletion; the activity read's categories, previous period, goal, and streak; goal validation.
- Unit: the clock's idle cut-off, visibility and focus pauses, the first-block start, the reading and practice hand-over, midnight splitting, and send retries.
- React Testing Library: the lesson box's own and typical times and their minute refresh; the lesson list's and Practice again's typical times; the Study goal field.
