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

1. `/courses` lists the courses in the one global library. There is no workspace, language namespace, or group switcher. The main navigation is Courses, Words, Journal, and Notices; Settings and Sign out live in the account menu.
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

1. A member reading a published course chooses Ask to contribute in the Contributors panel. The panel then says the request is waiting, and they can withdraw it.
2. The owner gets a notification that links to the course. The Contributors panel lists pending requests, and the owner accepts or declines each one. The requester is notified of the decision.
3. An accepted contributor sees unpublished lessons, every lesson's draft, and the draft course itself if the owner returns it to draft. They add lessons and edit the draft of any lesson, including a published one, while readers keep seeing the published version. The editor has no Publish, Discard, or Unpublish for them.
4. Reordering, deleting, publishing, and a published lesson's title and goal are left to the owner.
5. The owner sees who last edited each lesson, reviews the draft, and publishes it.
6. A contributor can stop contributing at any time, and the owner can remove a contributor after confirming. Either way their content stays, and they may ask again later.

## Practise a lesson

1. A member opens a published lesson's page. A practice block shows its instruction, its first three numbered prompts (with how many more there are), how many people are done with it, how many of its questions the member has left (or that they are done), and an Answer button. Fill-in prompts show `…` for each blank. Authors' versions and notes are not shown.
2. Answer opens a dialog with the instruction, any reading passage, and one answer field per question, holding any answers the member typed before on this device. When the lesson has a New words panel and the screen is wide, the dialog sits on the left over the text and the panel stays usable on the right.
3. The learner answers as many questions as they like, leaving any blank. A bar at the top shows which question they are on (Question 3 of 8). A fill-in item with several blanks has one field per blank. Enter in an answer checks it at once on their device: an answer that matches the author's version gets a short animated confirmation and focus moves to the next blank or question (from the last one, to the dialog's button), and any other answer keeps focus and shows the author's version as a reference, with a reminder that other answers can work too; Enter again moves on. The learner may change an answer to match it or keep their own; nobody else ever sees their answers.
4. The button reads Finish later while a question is blank and Done once every question has an answer. Pressing it, or closing the dialog any other way, saves how many questions are answered, and the practice shows the new count. Answering every question makes the member done and adds them to the practice's done count.
5. The answers stay in the browser across visits and sign-out, so the member can come back and change them.

## Work through a lesson step by step

1. At the top of the course page, above Manage course, a progress card shows the member's course percentage and one button: Continue lesson for the lesson they last moved in, otherwise Start lesson for the first lesson they have not finished, otherwise Practise again. A focused player opens with a progress bar and a step counter.
2. Text, callouts, and example sentences arrive one step at a time; an example shows its translation and note. A section heading is the title of the section's first step, never a step of its own.
3. Dialogue lines arrive one after another; earlier lines stay visible.
4. Practice questions are asked one by one with a single answer field, or one field per blank for a fill-in question with several blanks. A bar above each question shows its position within the practice. Next checks a filled answer first: a match moves on at once, and a miss shows the author's version and moves on with the next press; an empty answer moves on at once. Enter does the same as Next, so pressing Enter repeatedly walks through the lesson. Answers are saved as the same browser draft the lesson page's answer dialog uses, and leaving a question saves how many of the practice's questions are answered.
5. Back and Next move freely, and each move is saved. If the learner leaves mid-lesson, the progress card offers Pick up where you left off with Continue lesson; the player reopens at the saved step and offers Start over. After the last step the player shows that the lesson is complete, the learner's course percentage, and a link to the next lesson or back to the course.
6. A step that introduces new words shows them in a New words panel below it, with term, forms, and meaning, and Show more for a word's example and note; a section that holds only words is a step of its own. After the last step, a run that had words offers Review words: a page of word cards sized to fit the screen, where Show meaning flips a card to its meaning and Show all flips the whole page; Back and Next move by a page, and Back to the summary returns to the completion screen.
7. The finished lesson shows a check in the course's lesson list and Finished under its title, and the progress card moves on to the next unfinished lesson. The course's Progress panel shows the viewer's own percentage; a started lesson counts for the share of its steps already passed.
8. Once a member has finished lessons with words, the course page offers Review words for all of them in lesson order, each repeated term once. Nothing in a recap is recorded.
9. Each lesson in the course's lesson list also has its own actions (see [lesson actions](courses.md#lesson-actions)): Start, Continue at the saved step, or Start again for a finished lesson; Review words for that lesson's words when it has any; and Practise again when it has practices, which lists them with the member's own state and opens the chosen one's answer set.
10. A member can bookmark any word of a published lesson, finished or not, with the bookmark icon beside it in a New words list, the lesson page's New words panel, or on a recap card; pressing it again removes the bookmark. A draft preview offers no bookmarks.
11. Where a word, example, or dialogue line has audio ready, a speaker icon beside it plays it once; pressing it again stops it, and starting another clip stops the one playing. A dialogue's Play dialogue reads its lines in order in the speakers' voices, highlighting each line as it is spoken; in the player it reads only the lines shown so far. Items whose audio is not generated yet have no icon. Owners and contributors also hear a draft preview once its audio is ready.
12. Owners and contributors can run an unpublished lesson as a preview; it does not count toward progress.
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

1. A member opens Notices (`/notifications`) from the main navigation; no notification request runs in the background.
2. Unread and read events are visually distinct. The member may mark one event or every unread event read.
3. Post, answer, reply, pin, and reaction events link to the most specific surviving destination. A direct answer/reply link reveals the concealed discussion and scrolls to that item.
4. A deleted post/comment leaves the event in place with “Content no longer available.”

## Manage the account

1. `/settings` shows account profile, avatar, password, theme, and appearance controls.
2. Username is established during required setup. Later profile edits remain account-wide.
3. Avatar upload is optional and uses the existing square crop, public-by-URL storage, replacement cleanup, and remove flow.

## Compatibility period

Existing course and lesson rows were created under the retired group model. Until their columns are rebuilt, the server attaches open registrations to the installation's oldest active library record and keeps the old group ID inside API/storage calls. This is a migration bridge only: it is not exposed as a workspace, membership decision, URL namespace, or product authorization choice.
