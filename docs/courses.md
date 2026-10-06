# Courses

Status: C1 (course shell) delivered; later phases not started. Delivery phases live in the [roadmap](roadmap.md#course-phases).

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
| Notes, author's version entry | 2,000 / 1,000 characters |
| Dialogue turns | 50 per block, speaker label 40 characters |
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
- Answer sets snapshot each item prompt so they stay understandable after the practice is edited.

## Contributors and publishing

Course roles are per course and do not add group roles.

- **Owner:** edits everything, decides contributor requests, publishes and unpublishes the course, lessons, and blocks, and archives the course.
- **Contributor:** an accepted member who may add lessons and blocks and edit any unpublished lesson or block. Contributor work stays a draft until the owner publishes it.
- **Participant:** every active group member may read published content and answer practices.

Any active member may request to contribute. Requests follow the membership pattern: states are `pending`, `active`, `rejected`, `left`, and `removed`; there is at most one pending request per member and course; rejected, departed, and removed members may request again.

Published lessons and blocks are edited only by the owner. To let a contributor rework published content, the owner unpublishes it first. This keeps the owner's publishing decision meaningful without storing parallel revisions.

The group creator keeps the moderation powers described in [groups and membership](groups-and-membership.md#creator): they may remove any block, lesson, or answer and archive any course.

## Editing model

Authors save small pieces, so they can return to a course at any time.

- Every course, lesson, and block is saved through its own endpoint. There is no whole-course save.
- Lessons and blocks carry an integer version. An update must send the version it was based on; a stale version returns a conflict instead of overwriting a collaborator's work.
- Reordering sends the complete ordered ID list for one parent, and the server rewrites positions in one D1 batch.
- Server-side unpublished content is the durable draft. Local storage keeps only an unsaved block edit, under the [draft-key rules](posts-and-feed.md#composer-and-drafts) with draft kind `course-block` and the block or lesson ID as target.

## Reading and loading

- The course library lists the group's courses that the viewer may see, newest first. Library filtering by level is permitted because the library is not the feed.
- A course read returns the full outline (lesson IDs, titles, goals, positions, published state) plus the blocks of the first three visible lessons.
- Further lessons load by ID as the reader advances.
- Learner payloads never include authors' versions or item notes. Editors receive them for editing.

## Feed presence

The first time the owner publishes a course, the API creates one post of type `course` linked to it. The post carries reactions and ordinary visible comments, appears in strict chronological order at its creation time, and links to the course. It is not edited through the composer. Archiving the course leaves the post in place, and the post then shows that the course is unavailable.

Feed posts about later course changes are future work and will be derived from a course activity log.

## Media

The cover image reuses the [public R2 image pipeline](architecture.md#images) with a wide crop and keys under `courses/`. Replacement and removal clean up superseded objects. Images inside blocks are future work.

## Deletion and retention

Courses are archived, not hard-deleted. The owner or group creator may archive and restore a course; archived courses are hidden from the library except to the owner and group creator. Restoring returns the course to draft, and archived courses cannot be edited until they are restored. Deleting a lesson or block is hard deletion and removes its answer threads, replies, and reactions. Contributor departure keeps their authored content.

## Deferred

- Speaking practice, speak-and-repeat, and spoken answers. These need an explicit product exception for audio and pronunciation, and a privacy review because browser speech recognition may send audio to the browser vendor.
- Text-to-speech playback and interactive role-play dialogues
- Feed posts for course updates
- Course-specific notifications beyond contributor requests
- Images inside blocks
- Progress tracking of any kind
