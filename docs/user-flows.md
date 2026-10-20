# User flows

## Create an account

1. A signed-out visitor lands on the home page, which addresses committed Dutch and German learners and lists the practice they can focus on (grammar, vocabulary, listening, and progress), beside the create-account form. They choose Create account and enters an email and password.
2. Registration creates the account and signs it in immediately. No invitation, join request, or approval exists.
3. Before the library opens, the person must choose a unique username of 3–30 letters, numbers, or underscores.
4. The setup screen prominently offers an optional square avatar through a circular edit button over the avatar preview. Skipping the image never blocks setup.
5. Completing setup opens the global course library.

## Return to the app

1. A valid signed cookie opens `/courses`.
2. A signed-out visitor signs in with email and password, then opens `/courses`.
3. An account whose setup is incomplete always returns to setup before course, lesson, word, or settings routes open.
4. Signing out returns to the create-account/sign-in entry screen.

## Browse courses and lessons

1. `/courses` opens with the [home dashboard](learning-time.md#home-dashboard) (greeting, Continue, and Activity), then lists the courses in the one global library. There is no workspace, language namespace, or group switcher. The main navigation is the left rail: Courses (with every visible course listed beneath it), Words, Journal, and Tutor; Settings and Sign out live in the account menu at the rail's foot, and Settings links to Notices.
2. A course page presents its ordered lesson outline, the viewer's own progress, and the next lesson action.
3. Each course and lesson has a readable, stable route built from its title, such as `/courses/dutch-foundations/lessons/er-is-een-huis`. Older ID links redirect to it.
4. The lesson player, word recap, bookmarks, speech playback, and authoring behavior follow [courses.md](courses.md), [words.md](words.md), and [speech.md](speech.md).
5. Progress UI exposes the current viewer's progress, not a member leaderboard.

## Create and publish a course

1. A member opens Courses from the main navigation and chooses New course.
2. They enter a title and summary, plus an optional free-text level and intended learner, and create a draft.
3. The draft opens on its course page. Only the owner and accepted contributors can see it; it does not appear in other members' libraries.
4. The owner can edit the details and upload, replace, or remove a wide cover image. Editing the details also sets the dialogue voices: each speaker of the course's dialogues gets a voice or stays on Automatic, and each voice has a sample to listen to. See [dialogue cast](speech.md#dialogue-cast).
5. Publishing makes the course visible to every member in the newest-first library. The first publication also adds a course card to the top of the feed, where members can react, comment, and follow the link to the course. The owner can return it to draft at any time.
6. The owner or the library administrator (the bootstrap account) can archive the course after confirming. Other members no longer see it, and its feed card says the course is unavailable. The owner and creator still see it in the library and can restore it, which returns it as a draft.

7. The owner adds lessons with a title and optional goal. A new lesson is unpublished, appears in the course's lesson list with an Unpublished label, and opens on its own lesson page.
8. On the lesson page, Edit lesson opens a block editor: headings, paragraphs, lists, callouts, images, columns, examples, dialogues, practices, and New words, added from the slash menu and moved by dragging. The owner can also move lessons up or down in the course's lesson list.
9. The editor autosaves the lesson's draft. Readers see only the published version until the owner chooses Publish; Discard returns the draft to the published version, and Unpublish hides the lesson. An edit that has not reached the server yet stays in the browser and reopens on the next visit. Each New words row says whether the word's audio is ready (with a speaker button), pending, or failed; audio is generated a few minutes after saving, and the status updates without reloading. A word the voice says wrongly gets an IPA pronunciation under its details. See [speech](speech.md#playback).
10. If someone saved a newer version first, the editor merges the two by block and says so. Blocks both people changed are shown side by side, and the author keeps the newer version or their own edit for each. See [drafts and publishing](courses.md#drafts-and-publishing).
11. Readers see the course's lesson list and open each lesson on its own page, which links to the previous and next lessons.

## Contribute to a course

> Retired in the UI (2026-10-20): no screen offers these steps. They describe the backend roles only; see [courses.md](courses.md#contributors-and-publishing).

1. A member reading a published course chooses Ask to contribute in the Contributors panel. The panel then says the request is waiting, and they can withdraw it.
2. The owner gets a notification that links to the course. The Contributors panel on the course's manage page (Manage course on the course page) lists pending requests, and the owner accepts or declines each one. The requester is notified of the decision.
3. An accepted contributor sees unpublished lessons, every lesson's draft, and the draft course itself if the owner returns it to draft. They add lessons and edit the draft of any lesson, including a published one, while readers keep seeing the published version. The editor has no Publish, Discard, or Unpublish for them.
4. Reordering, deleting, publishing, and a published lesson's title and goal are left to the owner.
5. The owner sees who last edited each lesson, reviews the draft, and publishes it.
6. A contributor can stop contributing at any time, and the owner can remove a contributor after confirming. Either way their content stays, and they may ask again later.

## Practice a lesson

1. A member opens a published lesson's page. A practice block shows its instruction, its first three numbered prompts (with how many more there are), how many people are done with it, how many of its questions the member has left (or that they are done), and an Answer button. Fill-in prompts show `…` for each blank. Authors' versions and notes are not shown.
2. Answer opens a dialog with the instruction, any reading passage, and one answer field per question, holding any answers the member typed before on this device. When the lesson has a New words panel and the screen is wide, the dialog sits on the left over the text and the panel stays usable on the right.
3. The learner answers as many questions as they like, leaving any blank. A bar at the top shows which question they are on (Question 3 of 8). A fill-in item with several blanks has one field per blank. Enter in an answer checks it at once on their device: an answer that matches the author's version gets a short animated confirmation and focus moves to the next blank or question (from the last one, to the dialog's button), and any other answer keeps focus and shows the author's version as a reference, with a reminder that other answers can work too; Enter again moves on. The learner may change an answer to match it or keep their own; nobody else ever sees their answers.
4. The button reads Finish later while a question is blank and Done once every question has an answer. Pressing it, or closing the dialog any other way, saves how many questions are answered, and the practice shows the new count. Answering every question makes the member done and adds them to the practice's done count.
5. The answers stay in the browser across visits and sign-out, so the member can come back and change them.

## Work through a lesson step by step

1. At the top of the course page, below its header, a progress card shows the member's course percentage and one button: Continue lesson for the lesson they last moved in, otherwise Start lesson for the first lesson they have not finished, otherwise Practice again. A focused player opens with a progress bar and a step counter.
2. Text, callouts, and example sentences arrive one step at a time; an example shows its translation and note. A section heading is the title of the section's first step, never a step of its own.
3. Dialogue lines arrive one after another; earlier lines stay visible.
4. Practice questions are asked one by one with a single answer field, or one field per blank for a fill-in question with several blanks. A bar above each question shows its position within the practice. Next checks a filled answer first: a match moves on at once, and a miss shows the author's version and moves on with the next press; an empty answer moves on at once. Enter does the same as Next, so pressing Enter repeatedly walks through the lesson. Answers are saved as the same browser draft the lesson page's answer dialog uses, and leaving a question saves how many of the practice's questions are answered.
5. Back and Next move freely, and each move is saved. If the learner leaves mid-lesson, the progress card offers Pick up where you left off with Continue lesson; the player reopens at the saved step and offers Start over. After the last step the player shows that the lesson is complete, the learner's course percentage, and a link to the next lesson or back to the course.
6. A step that introduces new words shows them in a New words panel below it, with term, forms, and meaning, and Show more for a word's example and note; a section that holds only words is a step of its own. After the last step, a run that had words offers Review words: a page of word cards sized to fit the screen, where Show meaning flips a card to its meaning and Show all flips the whole page; Back and Next move by a page, and Back to the summary returns to the completion screen.
7. The finished lesson shows a check in the course's lesson list and Finished under its title, and the progress card moves on to the next unfinished lesson. The progress card's percentage counts a started lesson for the share of its steps already passed.
8. Once a member has finished lessons with words, the course page offers Review words for all of them in lesson order, each repeated term once. Nothing in a recap is recorded.
9. Each lesson in the course's lesson list also has its own actions (see [lesson actions](courses.md#lesson-actions)): Start, Continue at the saved step, or Start again for a finished lesson; Review words for that lesson's words when it has any; and Practice again when it has practices, which lists them with the member's own state and opens the chosen one's answer set.
10. A member can bookmark any word of a published lesson, finished or not, with the bookmark icon beside it in a New words list, the lesson page's New words panel, or on a recap card; pressing it again removes the bookmark. A draft preview offers no bookmarks.
11. On the Words tab they see their bookmarked words newest first and can narrow them to one lesson with the lesson filter; the choice stays in the address, so a reload or a shared link keeps it.
12. Drill on the Words tab opens a small setup: Weak words (their weakest words from memory and their bookmarks, weakest first) or one lesson's words, and Mixed, Understand Dutch, or Produce Dutch (German in a German library). Start opens the drill page with one card at a time. Show answer (or Space) flips the card to the whole word and speaks it when the reveal sound is on; Again (`1`) brings the card back a few cards later and Got it (`2`) retires it. A mono counter shows how many cards are done. At the end a summary says how many were Got it on the first try and how many needed Again, with Drill again for a fresh deck and Back to words. See [Drill](words.md#drill).
13. Where a word, example, or dialogue line has audio ready, a speaker icon beside it plays it once; pressing it again stops it, and starting another clip stops the one playing. A dialogue's Play dialogue reads its lines in order in the speakers' voices, highlighting each line as it is spoken, with a progress bar of the conversation. The learner can pause and resume, stop, skip to the previous or next line, or press a line's segment of the bar to continue listening from there; in the player it reads only the lines shown so far. Items whose audio is not generated yet have no icon. Owners and contributors also hear a draft preview once its audio is ready.
14. Owners and contributors can run an unpublished lesson as a preview; it does not count toward progress.

## Check progress and reset a lesson

C14 (the Progress tab and reset since C14c). [Courses](courses.md#lesson-progress-tab) owns the rules.

1. On a course page the learner opens the Progress tab. It says whether the course is complete and lists each published lesson with its state (Not started, In progress, Completed, or Missed when they skipped it and went on), how far through its storyline they are, practices done, words reviewed, and AI practices.
2. Reset on a lesson opens a confirmation listing what will be deleted: their place in the lesson, its completion, practice progress and answers, the word reviews and memory of the lesson's words, their pronunciation scores, and the bookmarks of the lesson's words. Confirming deletes them for good and refreshes the tab; a word the lesson shares with another lesson starts over there too.
3. On a lesson page, Reset lesson does the same and returns to the course's lesson list.
4. Every answer they check in a practice is kept privately for them and their tutor; the check itself still happens instantly on their device.

## Find weak words

C14d. [Words](words.md#weak-words-view) owns the rules.

1. On the Words tab the learner switches to Weak words. Words they have drilled or practised with the tutor are listed weakest first, each with five dots for its last five results (green for Got it, red for Again, hollow when there are fewer). There are no percentages.
2. I know this word removes a word from the list until they next get it wrong.
3. Drill these words starts a mixed Weak words drill. The drill setup also offers Weak words once they have memory, even without bookmarks.

## Study with the AI tutor

In progress (C14): the tutor and its web (C14i) and AI practices on lesson pages (C14h) are in place. The [AI tutor](ai-tutor.md) owns the rules. It works the same on a phone and a desktop.

1. On `/courses` a colourful Ask your tutor card opens `/ai` with a new conversation; earlier conversations are listed beside it (or behind a list button on a phone), with archived ones in their own view.
2. The learner asks what to study next. The tutor shows its steps as small chips (Checked your progress, Looked up lesson 6) and explains the lesson's grammar and words in short sections; Dutch phrases have speaker buttons that play them on request.
3. The tutor asks questions with answer components in the chat: a fill-in, a translation (typed or spoken), word order, de or het, multiple choice, quick review cards, Say it, dictation, or fix the mistake. Each is graded at once, and the result is kept for their memory and progress. A question they do not want to answer (for example Say it without the Microsoft recognizer) can be skipped; nothing is recorded and the tutor carries on.
4. When they are done, the tutor offers to mark the lesson complete. A card with Confirm and Cancel appears; nothing changes until they confirm. Resetting a lesson or saving a practice for other learners asks the same way.
5. After 40 turns in a UTC day the composer says the daily limit is reached and when it resets.
6. The learner can archive a conversation and later unarchive it; conversations are never deleted.
7. A practice the tutor saved shows up on its lesson page behind Show AI practices (*n*), placed after the block it belongs to, for everyone who reads the lesson.

### Plan a study session (C14l, planned)

Owned by [tutor sessions and memory](tutor-sessions-and-memory.md).

1. Before the first message the learner opens Context and, for example, focuses on one course and turns on more weak words; the defaults come from Settings.
2. They press Plan a session in the Session panel, or write "15 minutes, I feel rusty on last week's words". The tutor checks their weak words, recent topics, and due notes, and posts a dated plan: weak words from lesson 2.8, a few Say it sentences from recent lessons, modal verbs again (practised three days ago with two misses), a reading passage, and a summary.
3. It works through the steps with answer components; the Session panel ticks steps off and counts questions answered and words reviewed. It may swap a later step when something goes badly.
4. Along the way it teaches five extra time-of-day words. They appear in Words → From your tutor and in the Weak words view, and it adds a note to check them in three days.
5. It ends with a summary of what was covered and the mistakes to watch, read back from the session's own results. The panel keeps the plan under Earlier sessions.
6. Three days later, in a new conversation, the due note brings the tutor back to those words, mixed with the lesson's words. It may also leave a reading practice on lesson 2.8 marked Just for you. Readers answer it there and see the result at once; the course owner and contributors can remove it from the lesson after confirming.
## Share a piece of a lesson

In progress (C11): sharing works from the lesson page, the dialogs, and the player; share posts get their own journal cards in C11d. [Lesson shares](lesson-shares.md) owns the rules.

1. On a published lesson's page, a member clicks an example or a dialogue and presses the Share button that appears. In the Answer or Practice again dialog, each question has its own Share button, except in a practice with a reading passage. The lesson player offers Share on example, dialogue, and question steps.
2. A confirmation dialog previews the post and offers an optional note, already holding the example's note when it has one. Share publishes it; Cancel changes nothing.
3. The journal shows the post, for example “Masoud shared a question from lesson 3 of Dutch Foundations 5 hours ago.” Friends react and comment as on any post.
4. On a shared question's post page, anyone can type an answer and press Enter to see whether it matches the author's version, or see that version as a reference. The answer stays on their device.
5. Sharing the same piece again shows Already shared with a link to the post.

## Create a post

1. The member opens Journal, the third navigation tab (`/journal`), and taps the feed's "Write something…" prompt row or the floating create button shown after it scrolls away.
2. A centered desktop modal or full-screen mobile composer opens.
3. The post-type chooser appears at the top.
4. Switching type preserves each type’s fields and maps compatible values where sensible; nothing is cleared merely by switching.
5. The browser saves a versioned draft scoped to account.
6. Successful publication clears all composer state and places the post at the top on the next feed reconciliation.

## Answer without spoilers

1. An answer-oriented post opens on its own page at `/journal/:postId` with the answer count visible and the thread concealed.
2. The learner either submits an answer without seeing prior answers or explicitly reveals the thread.
3. Submission publishes a top-level comment and reveals the discussion for the current visit.
4. Returning to the page later starts concealed again.
5. Following a notification to a specific answer deliberately reveals and scrolls to it.

## Complete a reading

1. The detail page presents a wizard with one question per step and visible progress.
2. The learner may leave individual answers blank.
3. Progress is saved locally per account and post.
4. Final submission publishes one answer set containing every question in order; skipped entries read “No answer.”
5. Successful submission clears the reading draft.

## Review notifications

1. A member opens Notices (`/notifications`) from Settings; no notification request runs in the background.
2. Unread and read events are visually distinct. The member may mark one event or every unread event read.
3. Post, answer, reply, pin, and reaction events link to the most specific surviving destination. A direct answer/reply link reveals the concealed discussion and scrolls to that item.
4. A deleted post/comment leaves the event in place with “Content no longer available.”

## Manage the account

1. `/settings` shows account profile, avatar, password, theme, and appearance controls, and (C14) a Tutor section for native language, reply language, goals, and the tutor's notes. A superuser also sees a link to Analytics, which shows activity counts, AI and speech usage, and the AI settings.
2. Username is established during required setup. Later profile edits remain account-wide.
3. Avatar upload is optional and uses the existing square crop, public-by-URL storage, replacement cleanup, and remove flow.

## Compatibility period

Existing course and lesson rows were created under the retired group model. Until their columns are rebuilt, the server attaches open registrations to the installation's oldest active library record and keeps the old group ID inside API/storage calls. This is a migration bridge only: it is not exposed as a workspace, membership decision, URL namespace, or product authorization choice.
