# Words

Status: approved product change (C9, 2026-10-08), in progress. C9a (word cards) and C9b (bookmarks) are complete; C9c (Words tab) is planned. Phases are tracked in the [roadmap](roadmap.md#course-phases); [WORDS_PLAN.md](../WORDS_PLAN.md) holds the delivery checklist.

Words builds on [new words and recap](courses.md#new-words-and-recap). Lessons define words; this document owns how learners review them several at a time, bookmark them, and come back to them in a Words tab.

## Word cards

C9a replaces the one-card recap slideshow with a page of cards. Every surface that reviews words uses it: the lesson recap, the course recap, and the Words tab.

- **Page size.** Cards have a fixed height. Columns follow the width available to the grid: one below `40em`, then as many cards of the minimum card width as fit, at most three. Rows are as many full cards as fit in the height available to the grid without scrolling the page, at least one. A page holds columns × rows cards. Resizing recomputes it and keeps the page that holds the first visible word.
- **Navigation.** The counter shows the range and total ("Words 1–6 of 40", or "Word 3 of 40" for a single card). Back and Next move by a page. On the last page of a recap, Next becomes the recap's done action; the Words tab has no done action.
- **Flip in place.** A card's front shows the term and forms. Show meaning flips the card to its back: the term in a smaller size, then the meaning, example, and note. Hide meaning flips it back. The card keeps its height; text longer than the back can hold scrolls inside the card. The flip is a short rotation, removed under reduced motion. The toggle keeps focus and its label follows the side shown.
- **Show all.** Flips every card on the current page; when every card on the page is revealed it becomes Hide all. It is offered when the page holds more than one card. Changing page or page size shows every card's front again.
- **Speech.** A card's front has a speaker button for the term, and its back for the term and the example, where their audio is [ready](speech.md#playback).
- **Bookmark.** Each card carries a bookmark toggle on both sides (see [bookmarks](#bookmarks)), except where bookmarks are not offered.
- Nothing on a card is graded, timed, or recorded; a bookmark is the only thing a card saves. There is no shuffle.

## Bookmarks

C9b lets a member save words to come back to later.

- **Where.** A bookmark toggle appears on word cards and on every word in a [New words](courses.md#words-in-the-player) list: the player's panel, the words step, the reader's word list, and the lesson page's [New words panel](courses.md#lesson-pages) beside the text (sticky or as the list after the text). Toggling a word in that panel never changes its highlight or scrolls the panel. A member may bookmark words of lessons they have not finished.
- **Published words only.** Bookmarks are offered only for words of a lesson's published document. A preview of unpublished changes and a draft show no toggle.
- **Reference, not copy.** A bookmark is the member's key to a word, `(lesson, word ID)`; its text is read from the [`course_lesson_words`](data-model.md#course_lesson_words) index. An author's edits therefore show in bookmarks. A word that leaves the published document (edited out or the lesson unpublished) is hidden while it is gone and returns if a later publish brings back the same word ID. Deleting the lesson or course deletes its bookmarks.
- **Visibility.** Bookmarks show only while the member is active in the group and can still see the course under the course read rules. A former member's bookmarks are kept but cannot be read.
- **Private.** Bookmarks belong to one member. Nobody else sees them, nothing counts them, and they create no notifications or feed activity.
- **Duplicates.** The same term from two lessons is two words with two bookmarks, and the Words tab shows both. The course recap shows a repeated term once, at its first occurrence, so its toggle bookmarks that occurrence.
- **Limit.** A member holds at most `WORD_BOOKMARKS_MAX` (2,000) bookmarks per group; a further bookmark is refused with a message.
- Toggling is optimistic and reverts with a message if the request fails.

## Words tab

C9c adds a Words destination to the main navigation at `/groups/$groupId/words`.

- On desktop it is a primary destination in the navigation island. Below `48em` it sits in the More sheet; the dock keeps four slots.
- The page shows the member's bookmarked words in the current group as [word cards](#word-cards), newest bookmark first. Each card names its course and lesson.
- Removing a bookmark on the tab leaves the card in place, shown as not bookmarked and able to be bookmarked again, until the member leaves the page, so the grid does not jump.
- Pages of bookmarks load as Next reaches the end of those already loaded.
- With no bookmarks, the page explains how to bookmark a word from a lesson.
- There is no review scheduling, score, "known" state, or streak. The tab is not called "Practice", which already means practice blocks.

## API

All routes run after the group middleware, prove active membership, and scope every ID by `group_id`. Courses and lessons the viewer may not see return the same `404` as missing ones.

- `PUT /groups/:groupId/courses/:courseId/lessons/:lessonId/words/:wordId/bookmark` bookmarks a word; it is idempotent and keeps the first timestamp. `404` unless the word is in the lesson's published index row for that course and group. `409 WORD_BOOKMARKS_FULL` at the limit.
- `DELETE` on the same path removes the viewer's bookmark; idempotent.
- `GET /groups/:groupId/word-bookmarks/keys` returns `{ keys: [{ lessonId, wordId }] }`, every bookmark key of the viewer in the group (bounded by the limit). The web keeps it as one query that marks toggles on every surface and updates it optimistically.
- `GET /groups/:groupId/word-bookmarks?cursor=` returns the visible bookmarks, newest first, with the word, course and lesson IDs and titles, and the bookmark time, as `(created_at, lesson_id, word_id)` cursor pages.
- The course words response gains each word's `lessonId` so the course recap can toggle bookmarks.

Data lives in [`course_word_bookmarks`](data-model.md#course_word_bookmarks).
