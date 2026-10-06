# Courses

Status: delivered. C1 (course shell), C2 (lessons and content blocks), C3 (practice blocks and answer threads), C4 (feed presence), and C5 (contributors) are complete. Delivery phases live in the [roadmap](roadmap.md#course-phases).

## Purpose

A course is a long-lived, member-authored learning journal that belongs to one group. Members build it gradually, lesson by lesson, and practise it together. Courses complement the feed; they do not replace it. Nothing in a course is generated, translated, or graded by the platform.

## Structure

```text
course
  └─ lesson (ordered)
       └─ block (ordered)
```

There is no separate section level. A `heading` block titles a part of a lesson, so moving content between parts is an ordinary reorder.

### Course

- Required: title, summary
- Optional: level (free text, for example `A1 → early A2`), intended learner, cover image
- Owner: the member who created it
- Status: `draft`, `published`, or `archived`

Any active member may create a course. Draft courses are visible only to their owner and contributors.

### Lesson

- Required: title
- Optional: goal
- Ordered by position within the course
- Published flag; unpublished lessons are visible only to the owner and contributors

Lesson numbers shown to readers are derived from position, never stored.

### Blocks

Every block has an ordered position, a published flag, a kind, and a kind-specific payload. Payloads are validated by one shared Zod schema per kind and carry a payload version so stored content survives later shape changes.

| Kind | Payload |
| --- | --- |
| `heading` | title |
| `text` | content |
| `example` | sentence, optional translation, optional note |
| `dialogue` | ordered turns, each with a short speaker label and text |
| `practice` | instruction, optional passage (optional title, content), ordered items |

A practice item has a prompt, an optional author's version, and an optional note. Practice blocks have no mode field:

- A prompt containing one or more single-character `…` tokens is a fill-in item. Its author's version has exactly one nullable entry per blank, mapped left to right, matching the [fill-in post rule](posts-and-feed.md#fill-in-the-blanks).
- Any other prompt is open: translate, rewrite, or answer a question. Its author's version has at most one entry.
- An author's version with no filled entry is stored as an empty list, meaning the item has no author's version.
- A passage turns the block into a reading exercise whose items are its questions.

All block text is plain text under the [global content rules](product-requirements.md#global-content-rules). Highlighting is expressed by block kind, never by inline markup.

### Limits

Limits are safeguards, not learning constraints. They live in the shared contracts.

| Field | Limit |
| --- | --- |
| Course title / lesson title / heading / course level | 200 characters |
| Course summary, intended learner, lesson goal | 2,000 characters |
| Text content, passage content | 10,000 characters |
| Example sentence, translation, item prompt | 1,000 characters each |
| Practice instruction | 2,000 characters |
| Notes, author's version entry | 2,000 / 1,000 characters |
| Practice answer entry | 4,000 characters |
| Dialogue turns | 50 per block, speaker label 40 characters, line 1,000 characters |
| Practice items | 50 per block |
| Blocks per lesson | 200 |
| Lessons per course | 200 |

## Practice answers

Answers are collaborative, not graded. Participants decide together whether an answer works, because a sentence can have several valid translations.

- Each practice block has its own answer thread, built on the shared [discussion and reaction system](discussions-and-reactions.md#course-practice-threads).
- A top-level answer is one ordered answer set covering every item, like a reading answer set. Blank entries are allowed.
- Answers begin concealed and are revealed only by explicit consent, exactly like post answers.
- The author's version and item notes are delivered only with the revealed thread. They are a reference for discussion, never a verdict.
- There is no automatic matching, no positive-match signal, no pinning, and no score or completion tracking.
- Answer sets snapshot each item prompt so they stay understandable after the practice is edited. Editing an answer set keeps those snapshotted prompts; a new answer set follows the current items.
- Unsent answer sets are local drafts with draft kind `practice-answer` and the block ID as target.
- Practice-thread activity creates no notifications.

## Contributors and publishing

Course roles are per course and do not add group roles.

- **Owner:** edits everything, decides contributor requests, publishes and unpublishes the course, lessons, and blocks, and archives the course.
- **Contributor:** an accepted member who may add lessons and blocks and edit any unpublished lesson or block. Contributor work stays a draft until the owner publishes it.
- **Participant:** every active group member may read published content and answer practices.

Any active member may request to contribute. Requests follow the membership pattern: states are `pending`, `active`, `rejected`, `left`, and `removed`; there is at most one pending request per member and course; rejected, departed, and removed members may request again.

Published lessons and blocks are edited only by the owner. To let a contributor rework published content, the owner unpublishes it first. This keeps the owner's publishing decision meaningful without storing parallel revisions.

The group creator keeps the moderation powers described in [groups and membership](groups-and-membership.md#creator): they may remove any block, lesson, or answer and archive any course.

Contributor rules settled in C5:

- A member asks to contribute from the course page of a published course they can read; the owner cannot. The owner sees pending requests on the course page and accepts or rejects them. Only a requester who is still an active group member can be accepted.
- Requests and decisions notify: the owner on a request, and the requester on acceptance or rejection. Removal and leaving create no notification.
- A contributor may withdraw a pending request or leave an active role; both end as `left`. Only the owner removes an active contributor. The group creator does not decide contributor requests for another member's course.
- Contributors add lessons and blocks, including unpublished blocks inside a published lesson, and edit unpublished lessons and blocks. They cannot publish (`403 COURSE_PUBLISH_FORBIDDEN`) or change published content (`403 COURSE_CONTENT_PUBLISHED`).
- Reordering, deleting lessons and blocks, course details, the cover, course visibility, and contributor decisions stay with the owner, and deletion also with the group creator as moderation.
- Active contributors see a draft course and its unpublished lessons and blocks, receive practice references as editors, and see who last edited each lesson and block. Archived courses stay hidden from them.
- Leaving or being removed from the group ends every pending request and active contributor role in that group. Rejoining does not restore them.

## Editing model

Authors save small pieces, so they can return to a course at any time.

- Every course, lesson, and block is saved through its own endpoint. There is no whole-course save.
- Lessons and blocks carry an integer version. An update must send the version it was based on; a stale version returns a conflict instead of overwriting a collaborator's work. After a conflict the editor keeps the author's unsaved edit and lets them either rebase it on the newer version and save again, or discard it.
- An update carries the item's full editable state, including its published flag, so publishing is also a versioned edit. A block keeps its kind; changing kind means adding a new block.
- Reordering sends the complete ordered ID list for one parent, and the server rewrites positions in one D1 batch. A list that no longer matches the parent's children is rejected. Reordering does not change versions.
- Server-side unpublished content is the durable draft. Local storage keeps only an unsaved block edit, under the [draft-key rules](posts-and-feed.md#composer-and-drafts) with draft kind `course-block` and the block or lesson ID as target.

## Reading and loading

- The course library lists the group's courses that the viewer may see, newest first. Library filtering by level is permitted because the library is not the feed.
- A course read returns the full outline (lesson IDs, titles, goals, positions, published state) plus the blocks of the first three visible lessons.
- Further lessons load by ID as the reader advances.
- Learner payloads never include authors' versions or item notes. Editors receive them for editing.

## Feed presence

The first time the owner publishes a course, the API creates one post of type `course` linked to it, authored by the owner. The post carries reactions and ordinary visible comments, appears in strict chronological order at its creation time, and links to the course. It is not edited through the composer and cannot be pinned. Unpublishing, republishing, archiving, and restoring never create another post, and a deleted course post is not recreated. Archiving the course leaves the post in place, and the post then shows that the course is unavailable; a course returned to draft is likewise unavailable to everyone but its owner. Comments on the post notify its author like any post response. The [post type rules](posts-and-feed.md#course) own the card.

Courses published before C4 shipped count as already announced and have no course post.

Feed posts about later course changes are future work and will be derived from a course activity log.

## Media

The cover image reuses the [public R2 image pipeline](architecture.md#images) with the [interactive](settings-and-administration.md#image-cropper) wide crop and keys under `courses/`. Replacement and removal clean up superseded objects. Images inside blocks are future work.

## Deletion and retention

Courses are archived, not hard-deleted. The owner or group creator may archive and restore a course; archived courses are hidden from the library except to the owner and group creator. Restoring returns the course to draft, and archived courses cannot be edited until they are restored. Deleting a lesson or block is hard deletion and removes its answer threads, replies, and reactions. Contributor departure keeps their authored content.

## Deferred

- Speaking practice, speak-and-repeat, and spoken answers. These need an explicit product exception for audio and pronunciation, and a privacy review because browser speech recognition may send audio to the browser vendor.
- Text-to-speech playback and interactive role-play dialogues
- Feed posts for course updates
- Course-specific notifications beyond contributor requests
- Images inside blocks
- Progress tracking of any kind
