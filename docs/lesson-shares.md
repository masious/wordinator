# Lesson shares

> Approved product change (C11, 2026-10-11). In progress: the contracts, the `post_lesson_shares` table, and the lesson read's `myShares` (C11a), the share endpoint, share post reads, and note editing (C11b), the web share actions and confirmation (C11c), share posts in the journal with the answer check and note editing (C11d), and the local Storybook of every post variant (C11e) are in place; the production release is not yet. `LESSON_SHARES_PLAN.md` (removed in `5678d87`; see git history) holds the delivery steps.

A learner can share a piece of a lesson to the [journal](posts-and-feed.md) so friends can see it, react, and talk about it. A share is a journal post of type `lesson_share`; the post rules in [posts and feed](posts-and-feed.md#lesson-share) own its card, and this document owns what can be shared and how.

## What can be shared

| Kind | Source | Stored as | Shows |
| --- | --- | --- | --- |
| Example | an `example` block | snapshot | the sentence with its inline formatting, translation, note, and speech |
| Dialogue | a `dialogue` block | reference to `(lesson, block)` | the current published turns, with their speech and the dialogue transport |
| Question | one item of a `practice` block | snapshot | the practice's instruction and the item's prompt; the post page adds the [answer check](#answer-check) |

- Only these three. Paragraphs, headings, lists, callouts, images, new words, and whole practices are not shareable.
- A practice with a passage is a reading exercise: neither its passage nor its questions can be shared.
- A question is shared alone, with its practice's instruction. Fill-in blanks show as `…`.
- The item's note is editor-only ([practice answers](courses.md#practice-answers)) and is never part of a share.

### Snapshots and references

Examples and questions are copied from the lesson's **published** document when they are shared. Later edits, unpublishing, lesson deletion, or archiving the course never change or hide the shared content; only the link back to the lesson disappears once the viewer can no longer open it.

A dialogue is shared by reference and always shows the dialogue as currently published, so it follows the author's edits and keeps its [speech](speech.md). It shows "This dialogue is no longer available" when its block is no longer in the published document, the lesson is unpublished or deleted, or the course is archived (the same rule as the [course card](posts-and-feed.md#course)). It becomes available again if the block comes back, for example after republishing.

An example snapshot keeps the hash of its example clip. Clips are content-addressed and never deleted ([retention](speech.md)), so the share plays the same audio as the lesson did. An example shared before its clip was ready has no speech.

The server builds every snapshot itself from the published document. It never accepts block content from the client.

## Who can share

- Any account that has finished its [setup](profiles-and-settings.md#current-account-setup), from the published document of a lesson it can read, in a course that is not archived.
- Editors' draft previews, unpublished lessons, and archived courses offer no share action, and the API refuses them.
- A person can share a given example or dialogue once, and a given question once. Afterwards the share action reads **Already shared** and links to the post. Deleting the post allows sharing again.
- A question is identified for this purpose by its block and its prompt text (normalised with the contracts' `normalizeAnswer`), not by its position, because practice items have no stable IDs and authors reorder them.
- Sharing creates no notification. Comments and reactions on a share notify its author like any post.

## Where to share

- **Lesson page.** Clicking an example or dialogue block selects it and reveals its Share button; clicking elsewhere or Escape clears the selection. It clears on the click, not on the press, so the collapsing Share row never moves the control being clicked. Clicks on the block's own controls (speaker buttons, the dialogue transport, links) do not select it. Keyboard users focus the block and press Enter. There is no hover-only affordance, so touch behaves the same.
- **Answers and Practice again.** Each shown question has its own Share button, in the answers opened under a practice and in Practice again's dialog. Questions are not shared from the practice summary on the lesson page.
- **Lesson player.** Example, dialogue, and question steps offer Share; a dialogue's steps share the whole dialogue.
- A question of a practice with a passage shows a disabled Share with the reason.
- The share actions read the viewer's `myShares` from the lesson read; a successful share, or a `409 LESSON_SHARE_EXISTS` from another tab, is written into the cached lesson at once, so the action turns into Already shared without another request, and the journal's feeds are refetched.

## Confirmation

Share opens a dialog that previews the post exactly as the feed card will show it (the web's `LessonSharePreview`, built in the browser from the lesson for the preview only), with an optional **note** and Share and Cancel buttons. The note is the post's ordinary notes field: plain text under the post notes limit, hidden by default and revealed on the post page like every [post's notes](posts-and-feed.md#post-types), so a hint on a question is not a spoiler. For an example with a note, the field starts with that note, and the sharer can change or clear it. Questions and dialogues start empty.

The note is the only part of a share that can be edited later. Deleting follows the ordinary [post rules](posts-and-feed.md#editing-and-deletion).

## Answer check

A shared question's post page offers the lesson's [answer check](courses.md#practice-answers): one field per blank for fill-in items, Enter (or the Check button, for touch) to check, "Matches the author's version" on a match, and the author's version as a reference on a miss, never marked wrong. It uses the contracts' `answerMatches` and `blankMatches`, so it agrees with the lesson. The snapshot carries the author's version as published at share time; a question with no author's version has nothing to check against.

The check runs in the browser. The answer is never sent or stored on the server, is never shown to anyone else, and counts toward no progress. It is kept as a local draft (draft kind `share-answer`, with the post as target) under the [draft-key rules](posts-and-feed.md#composer-and-drafts). The web shows the author's version only after a miss, which prevents accidental spoilers and is not authorization.

The feed card shows only the instruction and prompt; answering happens on the post page. A question whose author's version is incomplete says there is nothing to check against and offers no field. In the feed, only a share's byline links to the post, so the piece's speech controls and links stay usable on the card ([lesson share card](posts-and-feed.md#lesson-share)). Comments on a share are ordinary visible comments: there is no concealed answer thread.

## API

- `POST /api/groups/:groupId/lesson-shares` takes `{ courseId, lessonId, blockId, itemIndex?, note? }`, with `itemIndex` only for a question. It answers `201` with the created post.
- `409 LESSON_SHARE_EXISTS` carries the existing `postId`. `422 LESSON_SHARE_NOT_SHAREABLE` covers a block that is not in the published document (including one only in the draft), an item index out of range, a block type that cannot be shared, an `itemIndex` sent for an example or dialogue or missing for a question, and a practice with a passage. Course and lesson visibility errors are the lesson read's (`404 COURSE_NOT_FOUND`, `404 LESSON_NOT_FOUND`); an archived course the viewer can still see returns `409 COURSE_ARCHIVED`, and an unpublished lesson its editors can see returns `409 LESSON_UNPUBLISHED`.
- The lesson number is the lesson's position among the course's published lessons, as learners see the outline.
- Lesson reads add `myShares`: the viewer's share keys for that lesson mapped to post IDs, so the share action knows it is already shared. The contracts' `lessonShareKey` computes a key on both sides.
- Feed, profile, post, and polling reads return share posts with the live lesson number and course title while the lesson is visible, and otherwise the titles saved at share time. A post carries `lessonShare` (null on every other type), discriminated by kind: every kind has a `source` (course, lesson, and block IDs, `linked` while the viewer can open the lesson, the titles, the lesson number, and the slugs for the link); an example adds its snapshot and its clip's `speechUrl`, a dialogue adds `available`, its turns (null when unavailable), and its turn speech map, and a question adds its snapshot.
- Editing a share post sends only `{ type: "lesson_share", notes }`; any other body returns `409 POST_NOT_EDITABLE`. Comments on a share cannot be pinned (`400 PIN_UNAVAILABLE`).

Storage is [`post_lesson_shares`](data-model.md#post_lesson_shares).
