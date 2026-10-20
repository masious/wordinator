# Learning time

Approved product change (C15, 2026-10-20). Wordinator measures how long each learner actively spends reading lessons, answering practices, drilling and browsing words, and working with the AI tutor. Each learner sees their own time; every lesson and practice shows how long learners typically take; the home page summarises the learner's week or month by category against a daily goal they set.

This document owns what is measured, the clock, how time reaches the server, the lesson and practice medians, activity categories, the daily goal and streak, and the home dashboard. Storage is in [data model](data-model.md#learning_time); the privacy exception for medians is in [security and privacy](security-and-privacy.md#learning-data).

## What is measured

Each measured second belongs to one **activity**. Rows are kept per account, local day, and target.

| Activity | Where the clock runs | Target | Focus |
| --- | --- | --- | --- |
| `reading` | A published [lesson page](courses.md#lesson-pages), outside every practice and AI practice | course, lesson | `grammar` or `lesson` |
| `practice` | A lesson practice's answer set: the lesson page's Answer dialog and [Practice again](courses.md#lesson-actions) | course, lesson, practice block | none |
| `ai_practice` | An expanded [AI practice](courses.md#ai-practices) on the lesson page, while the learner works inside it | course, lesson, AI practice | the practice's focus |
| `tutor` | An open [tutor](ai-tutor.md) conversation at `/ai` | none | none |
| `drill` | A [drill](words.md#drill) at `/words/drill` while its cards show (not during setup or the results) | the course for a course drill, otherwise none | none |
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
- Medians come from `GET .../lessons/:lessonId/metrics` (the lesson box) and the course read (lesson list and Practice again, as the outline's `typicalSeconds` and `typicalPractices`), computed at read time, rounded to whole minutes, and shown only with at least one learner. They include no account IDs or individual times.
- Lessons and practices edited after people finished them keep their earlier times. No version is recorded.

## Activity

`GET /api/groups/:groupId/learning-activity?range=week|month&end=YYYY-MM-DD` returns the viewer's time per local day for the seven or thirty days ending on `end` (required; the client sends its own local today). Every day is listed, zero-filled, from `from` to `to`. The response carries the period's `totals`, the `previousTotal` of the same number of days just before `from`, the `dailyGoalMinutes`, and the `streak`. Each day and the totals split time by category, and `aiPracticeFocus` splits the AI practice part by focus. **Categories**:

| Category | Activities |
| --- | --- |
| Lesson reading | `reading` with focus `lesson` |
| Grammar | `reading` with focus `grammar` |
| Practice | `practice` |
| Vocabulary | `drill`, `words` |
| AI practice | `ai_practice` and `tutor`, with `ai_practice` broken down by focus |

## Daily goal and streak

- Settings has a **Study goal**: minutes per day, from 5 to 240, or none (the default). It is stored on the [tutor profile](ai-tutor.md#tutor-profile) row (`daily_goal_minutes`), read with `GET /api/learning/goal`, and saved with `PUT /api/learning/goal` (`{ dailyGoalMinutes }`, `null` for no goal). Values outside 5–240 or not whole are `400 VALIDATION_ERROR`. Saving the tutor's fields keeps the goal.
- A day meets the goal when the learner's time that local day reaches it. Without a goal, any minute of study meets the day.
- The **streak** is the number of consecutive days that met it, ending today, or ending yesterday while today has not met it yet. It counts back at most 366 days from `end`, so a longer streak reads as 366.
- The goal and streak are personal. They are never shown to anyone else, compared, ranked, or rewarded, and nothing nags a learner who misses a day.

## Home dashboard

C15e (completed 2026-10-20). The signed-in home page is the [course library](courses.md#library-page) and opens with a study summary: a header, a Continue card, and an Activity card. It uses existing tokens only, adds no API, and follows the light and dark themes. Its reads are the activity read above and the course dashboard's `resume`.

- **Header.** Today's date as an eyebrow, a greeting with the learner's display name (morning, afternoon, or evening by the browser's clock), a calm line, and **Practice with AI** on the right, linking to `/ai`.
- **Continue.** A dark feature card with a streak chip (from one day), the resume lesson's title and its course, and today's goal line. The lesson is the library's choice (`resume`, see [library page](courses.md#library-page)): the newest unfinished lesson at its saved step, else the first unfinished published lesson. The action is **Continue lesson** (opening `?resume=true`, so it scrolls to the saved step) for a lesson in progress, **Start lesson** for one not started, and **Practice again** for a finished one. With no published lesson the card says where the next lesson will appear and offers no action.
- **Goal ring.** Today's share of the goal, capped at full, in the success colour once the goal is met. The goal line says what is left, or that the goal is met. Without a goal the ring has no arc, its centre shows today's time, and the card links to Settings to set one.
- **Activity.** The period total (`4h 20m`; `45 min`, `Under a minute`, or `0 min` below an hour), its change against the previous period as a whole percentage (`Nothing to compare with yet` when that period had no time), and a Week / Month switch that changes the read's `range`. `end` is the browser's local today, so the last bar is today. Each local day is one stacked bar by category, with today marked and the legend below. A day's bar is focusable and, on hover or focus, shows its categories. A period with no time shows a short empty state instead of bars.
- **Colours.** Categories use the vivid tokens, in the order of the legend: lesson reading blue, grammar violet, practice green, vocabulary yellow, AI practice pink. The ring uses `--color-action` on the Continue card's `--color-feature-*` surface, which is dark in both themes.
- **Layout.** The two cards sit side by side and stack below `48em`. The bars stay one row there; the month range labels every fifth day and today only.
- **Decisions.** The Continue card replaces the library's former Continue learning panel and its tutor half, so the page has one resume entry. The library's section heading is the course library title, under the greeting.

## Study time

Approved product change (C15f, 2026-10-20). The app rail shows the learner's own study time, so it is in reach on every page, not only on the home dashboard. It adds no API: it reads the activity read above with `range=week` and `end` set to the browser's local today, and adds the [clock's](#the-clock) unsent seconds per category, refreshed once a minute.

- **Where.** Every page except the course library, whose home dashboard already shows this, has a **Study time** card above the rail's profile row (collapsible since 2026-10-21). On a [lesson page](courses.md#lesson-box) the card is hidden until the profile row's Study time toggle shows it, and shown that way its figures are always open (changed 2026-10-21; the lesson box had a Lesson | Today | Week switch, and the lesson's own figures are now in the lesson box). Its summary row is always today: `Today · 16 min of 60 min` over a compact goal meter with its percentage, or `Today · 16 min` (`Today · nothing yet` before any time) without a goal, and a chevron at its end. The chevron opens the **Today | This week** switch and its figures, which then leave the goal to the summary row. The card's open or closed choice is kept on the device (`wordinator:ui:v1:study-figures-open`), closed by default and where storage is unavailable.
- **Figures.** Today is the last day of the read; This week is the read's seven days ending today (the home dashboard's Week). Each category with time is one row (Lesson reading, Grammar, Practice, Vocabulary, AI practice, as [above](#activity)), then a Total row. A period with no time says so instead. With a [daily goal](#daily-goal-and-streak), Today also shows a progress meter with today's share of it; This week shows no goal.
- **Changing tab** first eases the panel to the new content's height, then slides the new content in from the side of the chosen tab (from the right when moving right) as it fades in; under reduced motion it changes at once.
- **The switch** is remembered on the device (`wordinator:ui:v1:rail-study-period`, local storage); without a remembered choice, or where storage is unavailable, it opens on Today. A Lesson tab remembered from before 2026-10-21 reads as Today.
- **After a send,** the sent seconds are added to the cached activity reads by category (the AI practice focus split and the streak wait for the next read), so the rail and the home dashboard do not dip while the pending seconds move to the server.
- Like the goal and streak, it is personal and never shown to anyone else.

## Analytics

The superuser's [analytics](settings-and-administration.md#analytics) adds a Time section: minutes per day and per account, by category. `GET /api/admin/analytics/time?days=7|30|90` answers seconds, and the page shows whole minutes. Days are each learner's local days, under the same range as the other sections, so a learner's day near midnight may fall on a neighbouring UTC label. It shows durations only, like the other sections.

## Reset and deletion

- A lesson [reset](courses.md#reset) deletes the learner's `reading`, `practice`, and `ai_practice` time for the lesson. Their completion and practice progress go with it, and so do the saved snapshots.
- Lesson deletion deletes every account's time for the lesson. Course rows cascade the same way.
- Time recorded for a practice block that is later removed from the lesson stays, and still counts toward the lesson's practice time.

## Verification

- Contracts: the time request's day format, entry count, second limits, focus by activity, and target shape for each activity.
- Workers integration: authentication; visibility refusals for an unpublished lesson, a practice of another lesson, and an AI practice of another lesson; the elapsed-time clamp; the day window; upserts adding seconds; completion and done snapshots; medians across accounts including the viewer, and the course read's typical fields; reset and lesson deletion; the activity read's categories, previous period, goal, and streak; goal validation.
- Unit: the clock's idle cut-off, visibility and focus pauses, the first-block start, the reading and practice hand-over, midnight splitting, and send retries.
- React Testing Library: the lesson box's own and typical times and their minute refresh; the lesson list's and Practice again's typical times; the Words and tutor clocks; the Study goal field; the tutor confirmation card's focus line; the home dashboard's greeting, Continue card with and without a goal, range switch, bars, legend, and empty state (`organisms/LearningHome`), with its pure helpers in unit tests. The rail's study time: the lesson box's Lesson, Today, and This week tabs, today's goal meter, the remembered tab, and the card's two tabs, empty state, and failed read (`organisms/StudyTime`); the categories and the sent-time update in unit tests (`learningActivity.test.ts`).
